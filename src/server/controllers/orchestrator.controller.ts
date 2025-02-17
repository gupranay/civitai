import dayjs from 'dayjs';
import { env } from '~/env/server.mjs';
import { clickhouse } from '~/server/clickhouse/client';
import { constants, maxRandomSeed } from '~/server/common/constants';
import { SignalMessages } from '~/server/common/enums';
import { extModeration } from '~/server/integrations/moderation';
import { logToAxiom } from '~/server/logging/client';
import { REDIS_KEYS } from '~/server/redis/client';
import { GenerationSchema } from '~/server/schema/orchestrator/orchestrator.schema';
import { formatGenerationResponse } from '~/server/services/orchestrator/common';
import { createWorkflowStep } from '~/server/services/orchestrator/orchestrator.service';
import { submitWorkflow } from '~/server/services/orchestrator/workflows';
import { throwBadRequestError } from '~/server/utils/errorHandling';
import { createLimiter } from '~/server/utils/rate-limiting';
import { WORKFLOW_TAGS } from '~/shared/constants/generation.constants';
import { auditPrompt } from '~/utils/metadata/audit';
import { getRandomInt } from '~/utils/number-helpers';

type Ctx = { token: string; userId: number };

const blockedPromptLimiter = createLimiter({
  counterKey: REDIS_KEYS.GENERATION.COUNT,
  limitKey: REDIS_KEYS.GENERATION.LIMITS,
  fetchCount: async (userKey) => {
    const res = await clickhouse?.query({
      query: `
        SELECT
          COUNT(*) as count
        FROM prohibitedRequests
        WHERE time > subtractHours(now(), 24) AND userId = ${userKey}
      `,
      format: 'JSONEachRow',
    });

    const data = (await res?.json<{ count: number }[]>()) ?? [];
    const count = data[0]?.count ?? 0;
    return count;
  },
});

export async function generate({
  token,
  userId,
  civitaiTip,
  creatorTip,
  tags = [],
  ...args
}: GenerationSchema & Ctx) {
  // throw throwBadRequestError(`Your prompt was flagged for: `);
  if ('prompt' in args.data) {
    try {
      const { blockedFor, success } = auditPrompt(args.data.prompt);
      if (!success) throw { blockedFor, type: 'regex' };

      const { flagged, categories } = await extModeration
        .moderatePrompt(args.data.prompt)
        .catch((error) => {
          logToAxiom({ name: 'external-moderation-error', type: 'error', message: error.message });
          return { flagged: false, categories: [] as string[] };
        });
      if (flagged) throw { blockedFor: categories, type: 'external' };
    } catch (e) {
      const error = e as { blockedFor: string[]; type: string };

      const count = (await blockedPromptLimiter.getCount(userId.toString())) ?? 0;
      await blockedPromptLimiter.increment(userId.toString());

      let message = `Your prompt was flagged: ${error.blockedFor.join(', ')}`;
      if (count > constants.imageGeneration.requestBlocking.warned)
        message +=
          '. If you continue to attempt blocked prompts, your account will be sent for review.';
      else if (count > constants.imageGeneration.requestBlocking.notified)
        message +=
          '. Your account has been sent for review. If you continue to attempt blocked prompts, your generation permissions will be revoked.';
      else if (count > constants.imageGeneration.requestBlocking.muted)
        message += '. Your account has been muted.';

      throw throwBadRequestError(message);
    }
  }

  if (!('seed' in args.data) || !args.data.seed)
    args.data = { ...args.data, seed: getRandomInt(1, maxRandomSeed) };

  const step = await createWorkflowStep(args as GenerationSchema);

  const workflow = await submitWorkflow({
    token: token,
    body: {
      tags: [WORKFLOW_TAGS.GENERATION, ...tags],
      steps: [step],
      tips: {
        civitai: civitaiTip,
        creators: creatorTip,
      },
      callbacks: [
        {
          url: `${env.SIGNALS_ENDPOINT}/users/${userId}/signals/${SignalMessages.TextToImageUpdate}`,
          type: ['job:*', 'workflow:*'],
        },
      ],
    },
  });

  const [formatted] = await formatGenerationResponse([workflow]);
  return formatted;
}

export async function whatIf(args: GenerationSchema & Ctx) {
  const step = await createWorkflowStep(args);

  const workflow = await submitWorkflow({
    token: args.token,
    body: { steps: [step] },
    query: { whatif: true },
  });

  let ready = true,
    eta = dayjs().add(10, 'minutes').toDate(),
    position = 0;

  for (const step of workflow.steps ?? []) {
    for (const job of step.jobs ?? []) {
      const { queuePosition } = job;
      if (!queuePosition) continue;

      const { precedingJobs, startAt, support } = queuePosition;
      if (support !== 'available' && ready) ready = false;
      if (precedingJobs && precedingJobs < position) {
        position = precedingJobs;
        if (startAt && new Date(startAt).getTime() < eta.getTime()) eta = new Date(startAt);
      }
    }
  }

  return {
    cost: workflow.cost,
    ready,
    eta,
    position,
  };
}
