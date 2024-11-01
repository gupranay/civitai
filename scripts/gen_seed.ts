import { faker } from '@faker-js/faker';
import {
  ArticleEngagementType,
  Availability,
  CollectionType,
  ImageEngagementType,
  ImageGenerationProcess,
  ModelEngagementType,
  ModelFileVisibility,
  ModelModifier,
  ModelStatus,
  ModelUploadType,
  ModelVersionEngagementType,
  NsfwLevel,
  ReviewReactions,
  ScanResultCode,
  TagEngagementType,
  TagSource,
  TagType,
  ToolType,
  TrainingStatus,
  UserEngagementType,
} from '@prisma/client';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import { capitalize, pull, range, without } from 'lodash-es';
import format from 'pg-format';
import { constants } from '~/server/common/constants';
import { CheckpointType, ModelType, NotificationCategory } from '~/server/common/enums';
import { IMAGE_MIME_TYPE, VIDEO_MIME_TYPE } from '~/server/common/mime-types';
import { notifDbWrite } from '~/server/db/notifDb';
import { pgDbWrite } from '~/server/db/pgDb';
import { notificationProcessors } from '~/server/notifications/utils.notifications';
import { redis, REDIS_KEYS } from '~/server/redis/client';
// import { fetchBlob } from '~/utils/file-utils';

const numRows = 1000;

faker.seed(1337);
const randw = faker.helpers.weightedArrayElement;
const rand = faker.helpers.arrayElement;
const fbool = faker.datatype.boolean;

// const getUrlAsFile = async (url: string) => {
//   const blob = await fetchBlob(url);
//   if (!blob) return;
//   const lastIndex = url.lastIndexOf('/');
//   const name = url.substring(lastIndex + 1);
//   return new File([blob], name, { type: blob.type });
// };

// TODO fix tables ownership from doadmin to civitai

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const insertRows = async (table: string, data: any[][]) => {
  if (!data.length) {
    console.log(`No rows to insert. Skipping ${table}.`);
    return [];
  }

  console.log(`Inserting ${data.length} rows into ${table}`);

  // language=text
  let query = 'INSERT INTO %I VALUES %L ON CONFLICT DO NOTHING';

  if (
    !['ImageTool', 'ImageTechnique'].includes(table) &&
    !table.startsWith('TagsOn') &&
    !table.endsWith('Engagement')
  ) {
    query += ' RETURNING ID';
  }

  try {
    const ret = await pgDbWrite.query<{ id: number }>(format(query, table, data));

    if (ret.rowCount === data.length) console.log(`\t-> ✔️ Inserted ${ret.rowCount} rows`);
    else if (ret.rowCount === 0) console.log(`\t-> ⚠️ Inserted 0 rows`);
    else console.log(`\t-> ⚠️ Only inserted ${ret.rowCount} of ${data.length} rows`);

    return ret.rows.map((r) => r.id);
  } catch (error) {
    const e = error as MixedObject;
    console.log(`\t-> ❌  ${e.message}`);
    console.log(`\t-> Detail: ${e.detail}`);
    if (e.where) console.log(`\t-> where: ${e.where}`);
    return [];
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const insertNotifRows = async (table: string, data: any[][]) => {
  console.log(`Inserting ${data.length} rows into ${table}`);

  // language=text
  const query = 'INSERT INTO %I VALUES %L ON CONFLICT DO NOTHING RETURNING ID';

  try {
    const ret = await notifDbWrite.query<{ id: number }>(format(query, table, data));

    if (ret.rowCount === data.length) console.log(`\t-> ✔️ Inserted ${ret.rowCount} rows`);
    else if (ret.rowCount === 0) console.log(`\t-> ⚠️ Inserted 0 rows`);
    else console.log(`\t-> ⚠️ Only inserted ${ret.rowCount} of ${data.length} rows`);

    return ret.rows.map((r) => r.id);
  } catch (error) {
    const e = error as MixedObject;
    console.log(`\t-> ❌  ${e.message}`);
    console.log(`\t-> Detail: ${e.detail}`);
    if (e.where) console.log(`\t-> where: ${e.where}`);
    return [];
  }
};

const truncateRows = async () => {
  console.log('Truncating tables');
  await pgDbWrite.query(
    'TRUNCATE TABLE "User", "Tag", "Leaderboard", "Tool", "Technique" RESTART IDENTITY CASCADE'
  );
};

const truncateNotificationRows = async () => {
  console.log('Truncating notification tables');
  await notifDbWrite.query('TRUNCATE TABLE "Notification" RESTART IDENTITY CASCADE');
};

/**
 * User
 */
const genUsers = (num: number, includeCiv = false) => {
  const ret = [];

  if (includeCiv) {
    num -= 1;

    // civ user
    const civUser = [
      'Civitai',
      'hello@civitai.com',
      null,
      null,
      -1,
      true,
      false,
      'civitai',
      true,
      true,
      '2022-11-13 00:00:00.000',
      null,
      null,
      null,
      null,
      true,
      '{"fp": "fp16", "size": "pruned", "format": "SafeTensor"}',
      null,
      '{Buzz}',
      null,
      '{"scores": {"total": 39079263, "users": 223000, "images": 2043471, "models": 36812792, "reportsAgainst": -8000, "reportsActioned": null}, "firstImage": "2022-11-09T17:39:48.137"}',
      '{"newsletterSubscriber": true}',
      null,
      false,
      1,
      0,
      '{}',
      null,
      false,
      null,
      'Eligible',
      null,
    ];

    ret.push(civUser);
  }

  const seenUserNames: string[] = [];

  // random users
  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const isMuted = fbool(0.01);
    let username = faker.internet.userName();
    if (seenUserNames.includes(username)) username = `${username} ${faker.number.int(1_000)}`;
    seenUserNames.push(username);

    const row = [
      randw([
        { value: null, weight: 1 },
        { value: faker.person.fullName(), weight: 20 },
      ]), // name
      randw([
        { value: null, weight: 1 },
        { value: faker.internet.email(), weight: 20 },
      ]), // email
      randw([
        { value: null, weight: 1 },
        { value: faker.date.between({ from: created, to: Date.now() }).toISOString(), weight: 3 },
      ]), // "emailVerified"
      randw([
        { value: null, weight: 1 },
        { value: faker.image.avatar(), weight: 10 },
      ]), // image
      step, // id
      fbool(), // "blurNsfw"
      fbool(), // "showNsfw"
      randw([
        { value: null, weight: 1 },
        { value: username, weight: 20 },
      ]), // username
      fbool(0.01), // "isModerator"
      fbool(0.01), // tos
      created, // "createdAt"
      randw([
        { value: null, weight: 100 },
        { value: faker.date.between({ from: created, to: Date.now() }).toISOString(), weight: 1 },
      ]), // "deletedAt"
      randw([
        { value: null, weight: 100 },
        { value: faker.date.between({ from: created, to: Date.now() }).toISOString(), weight: 1 },
      ]), // "bannedAt"
      randw([
        { value: null, weight: 1 },
        { value: `cus_Na${faker.string.alphanumeric(12)}`, weight: 5 },
      ]), // "customerId"
      randw([
        { value: null, weight: 10 },
        { value: `sub_${faker.string.alphanumeric(24)}`, weight: 1 },
      ]), // "subscriptionId"
      fbool(), // "autoplayGifs"
      '{"fp": "fp16", "size": "pruned", "format": "SafeTensor"}', // "filePreferences" // TODO make random
      randw([
        { value: null, weight: 30 },
        { value: 'overall', weight: 2 },
        { value: 'new_creators', weight: 1 },
      ]), // "leaderboardShowcase"
      randw([
        { value: null, weight: 2 },
        { value: '{Buzz}', weight: 3 },
        { value: '{Moderation,Buzz}', weight: 1 },
      ]), // "onboardingSteps"
      null, // "profilePictureId" // TODO link with Image ID
      randw([
        { value: '{}', weight: 5 },
        { value: '{"scores": {"total": 0, "users": 0}}', weight: 3 },
        {
          value: `{"scores": {"total": ${faker.number.int(10_000_000)}, "users": ${faker.number.int(
            100_000
          )}, "images": ${faker.number.int(100_000)}, "models": ${faker.number.int(
            1_000_000
          )}, "articles": ${faker.number.int(100_000)}}, "firstImage": "${faker.date
            .between({ from: created, to: Date.now() })
            .toISOString()}"}`,
          weight: 1,
        },
      ]), // meta
      '{}', // settings // TODO not sure if we even need this
      isMuted ? faker.date.between({ from: created, to: Date.now() }).toISOString() : null, // "mutedAt"
      isMuted, // muted
      rand([1, 31]), // "browsingLevel" // TODO which other ones?
      rand([3, 15]), // onboarding // TODO which other ones?
      '{}', // "publicSettings" // TODO not sure if we even need this
      isMuted ? faker.date.between({ from: created, to: Date.now() }).toISOString() : null, // "muteConfirmedAt"
      fbool(0.01), // "excludeFromLeaderboards"
      null, // "eligibilityChangedAt" // TODO
      'Eligible', // "rewardsEligibility" // TODO
      randw([
        { value: null, weight: 3 },
        { value: `ctm_01j6${faker.string.alphanumeric(22)}`, weight: 1 },
      ]), // "paddleCustomerId"
    ];

    ret.push(row);
  }

  return ret;
};

/**
 * Model
 */
const genModels = (num: number, userIds: number[]) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const isCheckpoint = fbool(0.3);
    const isLora = fbool(0.6);
    const isDeleted = fbool(0.05);
    const isPublished = fbool(0.4);
    const isEa = fbool(0.05);

    const row = [
      `${capitalize(faker.word.adjective())}${capitalize(faker.word.noun())}`, // name
      rand([null, `<p>${faker.lorem.paragraph({ min: 1, max: 8 })}</p>`]), // description
      isCheckpoint
        ? 'Checkpoint'
        : isLora
        ? 'LORA'
        : rand(Object.values(ModelType).filter((v) => !['Checkpoint', 'LORA'].includes(v))), // type
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
      fbool(), // nsfw
      step, // id
      rand(userIds), // userId
      fbool(0.01), // tosViolation
      isDeleted
        ? 'Deleted'
        : isPublished
        ? 'Published'
        : rand(Object.values(ModelStatus).filter((v) => !['Deleted', 'Published'].includes(v))), // status
      null, // fromImportId // TODO
      fbool(0.1), // poi
      isPublished ? faker.date.between({ from: created, to: Date.now() }).toISOString() : null, // publishedAt
      faker.date.between({ from: created, to: Date.now() }).toISOString(), // lastVersionAt // TODO this one is annoying
      '{}', // meta
      fbool(), // allowDerivatives
      fbool(), // allowDifferentLicense
      fbool(), // allowNoCredit
      isDeleted ? faker.date.between({ from: created, to: Date.now() }).toISOString() : null, // deletedAt
      isCheckpoint ? rand(Object.values(CheckpointType)) : null, // checkpointType
      fbool(0.01), // locked
      isDeleted ? rand(userIds) : null, // deletedBy
      fbool(0.001), // underAttack
      isEa ? faker.date.future().toISOString() : null, // earlyAccessDeadline
      randw([
        { value: null, weight: 100 },
        { value: rand(Object.values(ModelModifier)), weight: 1 },
      ]), // mode
      isLora ? rand(Object.values(ModelUploadType)) : 'Created', // uploadType
      fbool(0.05), // unlisted
      randw([
        { value: '{}', weight: 20 },
        { value: '{"level": 31}', weight: 1 },
      ]), // gallerySettings
      isEa
        ? 'EarlyAccess'
        : randw([
            { value: 'Public', weight: 30 },
            {
              value: rand(
                Object.values(Availability).filter((v) => !['Public', 'EarlyAccess'].includes(v))
              ),
              weight: 1,
            },
          ]), // availability
      rand(['{Sell}', '{Image,RentCivit,Rent,Sell}', '{Image,RentCivit}']), // allowCommercialUse
      randw([
        { value: 0, weight: 5 },
        { value: 1, weight: 4 },
        { value: 28, weight: 3 },
        { value: 15, weight: 2 },
        { value: 31, weight: 2 },
      ]), // nsfwLevel
      '{}', // lockedProperties
      fbool(0.05), // minor
    ];
    ret.push(row);
  }
  return ret;
};

/**
 * ModelVersion
 */
const genMvs = (num: number, modelData: { id: number; type: ModelUploadType }[]) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    const model = rand(modelData);
    const isTrain = model.type === 'Trained';
    const created = faker.date.past({ years: 3 }).toISOString();
    const isDeleted = fbool(0.05);
    const isPublished = fbool(0.4);

    const row = [
      `V${faker.number.int(6)}`, //name
      rand([null, `<p>${faker.lorem.sentence()}</p>`]), // description
      isTrain ? faker.number.int({ min: 10, max: 10_000 }) : null, // steps
      isTrain ? faker.number.int({ min: 1, max: 200 }) : null, // epochs
      created, // createdAt // nb: not perfect since it can be different from the model
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
      step, // id
      model.id, // modelId
      rand(['{}', `{${faker.word.noun()}}`]), // trainedWords
      isDeleted
        ? 'Deleted'
        : isPublished
        ? 'Published'
        : rand(Object.values(ModelStatus).filter((v) => !['Deleted', 'Published'].includes(v))), // status
      null, // fromImportId // TODO
      faker.number.int({ min: 1, max: 8 }), // index // TODO needs other indices?
      fbool(0.01), // inaccurate
      rand(constants.baseModels), // baseModel
      rand(['{}', '{"imageNsfw": "None"}', '{"imageNsfw": "X"}']), // meta
      0, // earlyAccessTimeframe // TODO check model early access
      isPublished ? faker.date.between({ from: created, to: Date.now() }).toISOString() : null, // publishedAt
      rand([null, 1, 2]), // clipSkip
      null, // vaeId // TODO
      rand([null, ...constants.baseModelTypes]), // baseModelType
      isTrain
        ? rand([
            '{}',
            '{"type": "Character"}',
            '{"type": "Character", "params": {"engine": "kohya", "unetLR": 0.0005, "clipSkip": 1, "loraType": "lora", "keepTokens": 0, "networkDim": 32, "numRepeats": 14, "resolution": 512, "lrScheduler": "cosine_with_restarts", "minSnrGamma": 5, "noiseOffset": 0.1, "targetSteps": 1050, "enableBucket": true, "networkAlpha": 16, "optimizerType": "AdamW8Bit", "textEncoderLR": 0.00005, "maxTrainEpochs": 10, "shuffleCaption": false, "trainBatchSize": 2, "flipAugmentation": false, "lrSchedulerNumCycles": 3}, "staging": false, "baseModel": "realistic", "highPriority": false, "baseModelType": "sd15", "samplePrompts": ["", "", ""]}',
          ])
        : null, // trainingDetails
      isTrain ? rand(Object.values(TrainingStatus)) : null, // trainingStatus
      fbool(0.2), // requireAuth
      rand([null, '{"strength": 1, "maxStrength": 2, "minStrength": 0.1}']), // settings
      randw([
        { value: 'Public', weight: 2 },
        { value: 'Private', weight: 1 },
      ]), // availability
      randw([
        { value: 0, weight: 5 },
        { value: 1, weight: 4 },
        { value: 28, weight: 3 },
        { value: 15, weight: 2 },
        { value: 31, weight: 2 },
      ]), // nsfwLevel
      null, // earlyAccessConfig // TODO
      null, // earlyAccessEndsAt // TODO
      model.type, // uploadType
    ];
    ret.push(row);
  }
  return ret;
};

/**
 * ModelFile
 */
const genMFiles = (num: number, mvData: { id: number; type: ModelUploadType }[]) => {
  const ret = [];

  // TODO do these URLs work?
  const typeMap = {
    Model: {
      ext: 'safetensors',
      url: 'https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/modelVersion/627691/Capitan_V2_Nyakumi_Neko_style.safetensors',
      meta: '{"fp": "fp16", "size": "full", "format": "SafeTensor"}',
      metaTrain:
        '{"format": "SafeTensor", "selectedEpochUrl": "https://orchestration.civitai.com/v1/consumer/jobs/2604a7f9-fced-4279-bc4e-05fc3bd95e29/assets/Capitan_V2_Nyakumi_Neko_style.safetensors"}',
    },
    'Training Data': {
      ext: 'zip',
      url: 'https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/training-images/3625125/806329TrainingData.yqVq.zip',
      meta: '{"fp": null, "size": null, "format": "Other"}',
      metaTrain:
        '{"format": "Other", "numImages": 26, "ownRights": false, "numCaptions": 26, "shareDataset": false, "trainingResults": {"jobId": "c5657331-beee-488d-97fa-8b9e6d6fd48f", "epochs": [{"model_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo-000001.safetensors", "epoch_number": 1, "sample_images": [{"prompt": "blademancy, furry", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000001_00_20240904200838.png"}, {"prompt": "light particles, dual wielding, brown hair, standing, holding, grey background, beard, gradient, no humans, necktie", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000001_01_20240904200845.png"}, {"prompt": "dagger, scar, weapon, english text, halberd, blue necktie, facial hair, artist name, green theme, formal", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000001_02_20240904200852.png"}]}, {"model_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo-000002.safetensors", "epoch_number": 2, "sample_images": [{"prompt": "blademancy, furry", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000002_00_20240904201044.png"}, {"prompt": "light particles, dual wielding, brown hair, standing, holding, grey background, beard, gradient, no humans, necktie", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000002_01_20240904201051.png"}, {"prompt": "dagger, scar, weapon, english text, halberd, blue necktie, facial hair, artist name, green theme, formal", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000002_02_20240904201058.png"}]}, {"model_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo-000003.safetensors", "epoch_number": 3, "sample_images": [{"prompt": "blademancy, furry", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000003_00_20240904201248.png"}, {"prompt": "light particles, dual wielding, brown hair, standing, holding, grey background, beard, gradient, no humans, necktie", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000003_01_20240904201255.png"}, {"prompt": "dagger, scar, weapon, english text, halberd, blue necktie, facial hair, artist name, green theme, formal", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000003_02_20240904201302.png"}]}, {"model_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo-000004.safetensors", "epoch_number": 4, "sample_images": [{"prompt": "blademancy, furry", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000004_00_20240904201452.png"}, {"prompt": "light particles, dual wielding, brown hair, standing, holding, grey background, beard, gradient, no humans, necktie", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000004_01_20240904201459.png"}, {"prompt": "dagger, scar, weapon, english text, halberd, blue necktie, facial hair, artist name, green theme, formal", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000004_02_20240904201505.png"}]}, {"model_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo-000005.safetensors", "epoch_number": 5, "sample_images": [{"prompt": "blademancy, furry", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000005_00_20240904201656.png"}, {"prompt": "light particles, dual wielding, brown hair, standing, holding, grey background, beard, gradient, no humans, necktie", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000005_01_20240904201702.png"}, {"prompt": "dagger, scar, weapon, english text, halberd, blue necktie, facial hair, artist name, green theme, formal", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000005_02_20240904201709.png"}]}, {"model_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo-000006.safetensors", "epoch_number": 6, "sample_images": [{"prompt": "blademancy, furry", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000006_00_20240904201900.png"}, {"prompt": "light particles, dual wielding, brown hair, standing, holding, grey background, beard, gradient, no humans, necktie", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000006_01_20240904201907.png"}, {"prompt": "dagger, scar, weapon, english text, halberd, blue necktie, facial hair, artist name, green theme, formal", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000006_02_20240904201913.png"}]}, {"model_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo-000007.safetensors", "epoch_number": 7, "sample_images": [{"prompt": "blademancy, furry", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000007_00_20240904202103.png"}, {"prompt": "light particles, dual wielding, brown hair, standing, holding, grey background, beard, gradient, no humans, necktie", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000007_01_20240904202110.png"}, {"prompt": "dagger, scar, weapon, english text, halberd, blue necktie, facial hair, artist name, green theme, formal", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000007_02_20240904202117.png"}]}, {"model_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo-000008.safetensors", "epoch_number": 8, "sample_images": [{"prompt": "blademancy, furry", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000008_00_20240904202306.png"}, {"prompt": "light particles, dual wielding, brown hair, standing, holding, grey background, beard, gradient, no humans, necktie", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000008_01_20240904202313.png"}, {"prompt": "dagger, scar, weapon, english text, halberd, blue necktie, facial hair, artist name, green theme, formal", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000008_02_20240904202320.png"}]}, {"model_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo-000009.safetensors", "epoch_number": 9, "sample_images": [{"prompt": "blademancy, furry", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000009_00_20240904202510.png"}, {"prompt": "light particles, dual wielding, brown hair, standing, holding, grey background, beard, gradient, no humans, necktie", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000009_01_20240904202517.png"}, {"prompt": "dagger, scar, weapon, english text, halberd, blue necktie, facial hair, artist name, green theme, formal", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000009_02_20240904202523.png"}]}, {"model_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo.safetensors", "epoch_number": 10, "sample_images": [{"prompt": "blademancy, furry", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000010_00_20240904202715.png"}, {"prompt": "light particles, dual wielding, brown hair, standing, holding, grey background, beard, gradient, no humans, necktie", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000010_01_20240904202721.png"}, {"prompt": "dagger, scar, weapon, english text, halberd, blue necktie, facial hair, artist name, green theme, formal", "image_url": "https://orchestration.civitai.com/v1/consumer/jobs/c5657331-beee-488d-97fa-8b9e6d6fd48f/assets/blademancer_2_stabby_boogaloo_e000010_02_20240904202728.png"}]}], "history": [{"time": "2024-09-04T19:58:04.411Z", "jobId": "c5657331-beee-488d-97fa-8b9e6d6fd48f", "status": "Submitted"}, {"time": "2024-09-04T19:58:10.988Z", "status": "Processing", "message": ""}, {"time": "2024-09-04T20:29:37.747Z", "status": "InReview", "message": "Job complete"}], "attempts": 1, "end_time": "2024-09-04T20:29:35.087Z", "start_time": "2024-09-04T19:58:09.668Z", "submittedAt": "2024-09-04T19:58:04.411Z", "transactionId": "2ebb5147-5fd3-4dbb-a735-e206d218686b"}}',
    },
    Archive: {
      ext: 'zip',
      url: 'https://civitai-delivery-worker-prod-2023-05-01.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/91602/default/bingLogoRemoval.2ayv.zip',
      meta: '{"fp": null, "size": null, "format": "Other"}',
      metaTrain: '{"fp": null, "size": null, "format": "Other"}',
    },
    Config: {
      ext: 'yaml',
      url: 'https://civitai-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/14014/training-images/somnia140.cR9o.yaml',
      meta: '{"format": "Other"}',
      metaTrain: '{"format": "Other"}',
    },
    Negative: {
      ext: 'pt',
      url: 'https://civitai-delivery-worker-prod-2023-10-01.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/default/3336/aloeanticgi1500.sPBn.pt',
      meta: '{"fp": null, "size": null, "format": "Other"}',
      metaTrain: '{"fp": null, "size": null, "format": "Other"}',
    },
    'Pruned Model': {
      ext: 'safetensors',
      url: 'https://civitai-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/78515/training-images/mihaV3E100.cCux.safetensors',
      meta: '{"fp": "fp16", "size": "pruned", "format": "SafeTensor"}',
      metaTrain: '{"fp": "fp16", "size": "pruned", "format": "SafeTensor"}',
    },
  };

  for (let step = 1; step <= num; step++) {
    const mv = rand(mvData);
    const isTrain = mv.type === 'Trained';
    const created = faker.date.past({ years: 3 }).toISOString();
    const passScan = fbool(0.98);
    const type = randw([
      { value: 'Model', weight: 8 },
      { value: 'Training Data', weight: 5 },
      { value: 'Archive', weight: 1 },
      { value: 'Config', weight: 1 },
      { value: 'Negative', weight: 1 },
      { value: 'Pruned Model', weight: 1 },
    ]);

    const row = [
      (type === 'Training Data'
        ? `${mv.id}_training_data`
        : `${faker.word.noun()}_${faker.number.int(100)}`) + `.${typeMap[type].ext}`, // name
      typeMap[type].url, // url
      faker.number.float(2_000_000), // sizeKB
      created, // createdAt
      mv.id, // modelVersionId
      passScan
        ? ScanResultCode.Success
        : rand(Object.values(ScanResultCode).filter((v) => !['Success'].includes(v))), // pickleScanResult
      'No Pickle imports', // pickleScanMessage
      passScan
        ? ScanResultCode.Success
        : rand(Object.values(ScanResultCode).filter((v) => !['Success'].includes(v))), // virusScanResult
      null, // virusScanMessage
      passScan ? faker.date.between({ from: created, to: Date.now() }).toISOString() : null, // scannedAt
      passScan
        ? `{"url": "${
            typeMap[type].url
          }", "fixed": null, "hashes": {"CRC32": "${faker.string.hexadecimal({
            length: 8,
            casing: 'upper',
            prefix: '',
          })}", "AutoV1": "${faker.string.hexadecimal({
            length: 8,
            casing: 'upper',
            prefix: '',
          })}", "AutoV2": "${faker.string.hexadecimal({
            length: 10,
            casing: 'upper',
            prefix: '',
          })}", "AutoV3": "${faker.string.hexadecimal({
            length: 64,
            casing: 'upper',
            prefix: '',
          })}", "Blake3": "${faker.string.hexadecimal({
            length: 64,
            casing: 'upper',
            prefix: '',
          })}", "SHA256": "${faker.string.hexadecimal({
            length: 64,
            casing: 'upper',
            prefix: '',
          })}"}, "fileExists": 1, "conversions": {}, "clamscanOutput": "", "clamscanExitCode": 0, "picklescanOutput": "", "picklescanExitCode": 0, "picklescanGlobalImports": null, "picklescanDangerousImports": null}`
        : null, // rawScanResult
      faker.date.between({ from: created, to: Date.now() }).toISOString(), // scanRequestedAt
      randw([
        { value: null, weight: 2 },
        { value: true, weight: 3 },
        { value: false, weight: 1 },
      ]), // exists
      step, // id
      type, // type
      isTrain ? typeMap[type].metaTrain : typeMap[type].meta, // metadata
      rand(Object.values(ModelFileVisibility)), // visibility
      fbool(0.1), // dataPurged
      type === 'Model'
        ? '{"ss_v2": "False", "ss_seed": "431671283", "ss_epoch": "6", "ss_steps": "444", "ss_lowram": "False", "ss_unet_lr": "1.0", "ss_datasets": "[{\\"is_dreambooth\\": true, \\"batch_size_per_device\\": 5, \\"num_train_images\\": 204, \\"num_reg_images\\": 0, \\"resolution\\": [1024, 1024], \\"enable_bucket\\": true, \\"min_bucket_reso\\": 256, \\"max_bucket_reso\\": 2048, \\"tag_frequency\\": {\\"img\\": {\\"1girl\\": 96, \\"solo\\": 63, \\"hat\\": 63, \\"skirt\\": 28, \\"armband\\": 11, \\"vest\\": 37, \\"open mouth\\": 46, \\"brown hair\\": 75, \\"brown vest\\": 2, \\"cowboy hat\\": 8, \\"shirt\\": 17, \\"white shirt\\": 11, \\"closed eyes\\": 10, \\"smile\\": 40, \\"water\\": 3, \\"wet\\": 2, \\"nude\\": 1, \\"long hair\\": 40, \\"outdoors\\": 7, \\"bathing\\": 1, \\"tattoo\\": 2, \\"witch hat\\": 19, \\"food\\": 2, \\"sitting\\": 13, \\"indian style\\": 1, \\"cup\\": 6, \\"bare shoulders\\": 2, \\"steam\\": 2, \\"brown eyes\\": 16, \\"off shoulder\\": 2, \\"holding\\": 11, \\"blue eyes\\": 8, \\"cat\\": 25, \\"blue sky\\": 1, \\"day\\": 9, \\"sky\\": 7, \\"surprised\\": 5, \\"black hair\\": 22, \\"white background\\": 4, \\"wide-eyed\\": 5, \\"dress\\": 7, \\"off-shoulder dress\\": 1, \\"simple background\\": 5, \\"looking at viewer\\": 9, \\"blush\\": 19, \\"door\\": 1, \\"long sleeves\\": 8, \\"book\\": 16, \\"socks\\": 12, \\"bookshelf\\": 2, \\"barefoot\\": 2, \\"heart\\": 2, \\"white dress\\": 2, \\"breasts\\": 1, \\"sleeveless\\": 1, \\"upper body\\": 8, \\"frown\\": 1, \\"closed mouth\\": 7, \\"grin\\": 2, \\"short hair\\": 3, \\"running\\": 4, \\"motion blur\\": 1, \\"bag\\": 14, \\"speed lines\\": 1, \\"arm up\\": 1, \\"laughing\\": 1, \\":d\\": 3, \\"freckles\\": 4, \\"clenched teeth\\": 1, \\"teeth\\": 2, \\"leg warmers\\": 4, \\"loose socks\\": 3, \\"^^^\\": 2, \\"one eye closed\\": 2, \\"black eyes\\": 2, \\"broom\\": 9, \\"railing\\": 1, \\"boots\\": 9, \\"paper\\": 2, \\"holding paper\\": 1, \\"brown headwear\\": 1, \\"plaid\\": 2, \\"indoors\\": 2, \\"hands on hips\\": 2, \\"spiked hair\\": 3, \\"angry\\": 1, \\"from behind\\": 2, \\"dirty\\": 1, \\"red vest\\": 1, \\"belt\\": 2, \\"1boy\\": 3, \\"solo focus\\": 1, \\"shorts\\": 3, \\"striped\\": 1, \\"torn clothes\\": 2, \\"male focus\\": 2, \\"signature\\": 1, \\"from side\\": 2, \\"handbag\\": 4, \\"reading\\": 2, \\"walking\\": 1, \\"quill\\": 2, \\"feathers\\": 2, \\"fingernails\\": 1, \\"holding book\\": 3, \\"open book\\": 2, \\"robot\\": 1, \\"spider web\\": 1, \\"silk\\": 1, \\"messenger bag\\": 1, \\"weapon\\": 3, \\"sword\\": 2, \\"grass\\": 3, \\"nature\\": 5, \\"tree\\": 6, \\"forest\\": 4, \\"apron\\": 2, \\"sleeves rolled up\\": 1, \\"tray\\": 1, \\"tears\\": 3, \\"horse\\": 1, \\"covering face\\": 1, \\"kneehighs\\": 1, \\"bottle\\": 2, \\"blue background\\": 2, \\"sweat\\": 1, \\"flask\\": 1, \\":o\\": 1, \\"orange background\\": 1, \\"mug\\": 2, \\"messy hair\\": 1, \\"stick\\": 1, \\"injury\\": 1, \\"sleeping\\": 1, \\"lying\\": 2, \\"broom riding\\": 5, \\"cape\\": 2, \\"coin\\": 1, \\"crying\\": 2, \\"kneeling\\": 1, \\"holding weapon\\": 1, \\"holding sword\\": 1, \\"multiple girls\\": 3, \\"2girls\\": 1, \\"braid\\": 2, \\"fire\\": 4, \\"portrait\\": 2, \\"sidelocks\\": 1, \\"forehead\\": 2, \\"v-shaped eyebrows\\": 1, \\"looking to the side\\": 1, \\"basket\\": 2, \\"cave\\": 1, \\"straw hat\\": 3, \\"flower\\": 1, \\"from above\\": 1, \\"looking up\\": 1, \\"multiple boys\\": 1, \\"armor\\": 1, \\"polearm\\": 1, \\"ocean\\": 1, \\"cloud\\": 5, \\"beach\\": 2, \\"blurry\\": 1, \\"blurry background\\": 1, \\"skewer\\": 1, \\"multicolored hair\\": 1, \\"two-tone hair\\": 1, \\"swimsuit\\": 4, \\"fish\\": 1, \\"fork\\": 1, \\"bikini\\": 3, \\"navel\\": 1, \\"polka dot\\": 3, \\"polka dot bikini\\": 2, \\"monochrome\\": 5, \\"greyscale\\": 5, \\"bow\\": 2, \\"watercraft\\": 1, \\"boat\\": 1, \\"witch\\": 2, \\"shell\\": 1, \\"jewelry\\": 1, \\"earrings\\": 1, \\"head rest\\": 2, \\"rabbit\\": 1, \\"chair\\": 2, \\"suspenders\\": 1, \\"window\\": 1, \\"plant\\": 1, \\"holding cup\\": 1, \\"pants\\": 1, \\"tentacles\\": 1, \\"underwater\\": 1, \\"octopus\\": 1, \\"bubble\\": 1, \\"air bubble\\": 1, \\"playing games\\": 1, \\"board game\\": 1, \\"hood\\": 1, \\"staff\\": 1, \\"hood up\\": 1, \\"hug\\": 1, \\"purple hair\\": 1, \\"hand to own mouth\\": 1, \\"green shirt\\": 1, \\"gloves\\": 3, \\"flying\\": 4, \\"bird\\": 1, \\"mouse\\": 2, \\"animal\\": 1, \\"rain\\": 1, \\"under tree\\": 1, \\"against tree\\": 1, \\"expressions\\": 1, \\"multiple views\\": 1, \\"reference sheet\\": 1, \\"airship\\": 1, \\"falling\\": 1, \\"floating island\\": 1, \\"crossed arms\\": 1, \\"brown background\\": 1, \\"profile\\": 1, \\"potion\\": 1, \\"sketch\\": 2, \\"thinking\\": 1, \\"hand on own chin\\": 1, \\"detached sleeves\\": 1}}, \\"bucket_info\\": {\\"buckets\\": {\\"0\\": {\\"resolution\\": [128, 256], \\"count\\": 2}, \\"1\\": {\\"resolution\\": [128, 320], \\"count\\": 2}, \\"2\\": {\\"resolution\\": [128, 448], \\"count\\": 2}, \\"3\\": {\\"resolution\\": [192, 256], \\"count\\": 10}, \\"4\\": {\\"resolution\\": [192, 384], \\"count\\": 2}, \\"5\\": {\\"resolution\\": [192, 448], \\"count\\": 2}, \\"6\\": {\\"resolution\\": [192, 512], \\"count\\": 4}, \\"7\\": {\\"resolution\\": [192, 768], \\"count\\": 2}, \\"8\\": {\\"resolution\\": [256, 128], \\"count\\": 2}, \\"9\\": {\\"resolution\\": [256, 192], \\"count\\": 6}, \\"10\\": {\\"resolution\\": [256, 256], \\"count\\": 4}, \\"11\\": {\\"resolution\\": [256, 384], \\"count\\": 2}, \\"12\\": {\\"resolution\\": [256, 448], \\"count\\": 8}, \\"13\\": {\\"resolution\\": [256, 512], \\"count\\": 2}, \\"14\\": {\\"resolution\\": [256, 768], \\"count\\": 2}, \\"15\\": {\\"resolution\\": [320, 256], \\"count\\": 2}, \\"16\\": {\\"resolution\\": [320, 576], \\"count\\": 2}, \\"17\\": {\\"resolution\\": [320, 704], \\"count\\": 4}, \\"18\\": {\\"resolution\\": [320, 768], \\"count\\": 4}, \\"19\\": {\\"resolution\\": [320, 896], \\"count\\": 2}, \\"20\\": {\\"resolution\\": [384, 192], \\"count\\": 2}, \\"21\\": {\\"resolution\\": [384, 256], \\"count\\": 2}, \\"22\\": {\\"resolution\\": [384, 448], \\"count\\": 2}, \\"23\\": {\\"resolution\\": [384, 512], \\"count\\": 2}, \\"24\\": {\\"resolution\\": [384, 576], \\"count\\": 4}, \\"25\\": {\\"resolution\\": [384, 640], \\"count\\": 4}, \\"26\\": {\\"resolution\\": [384, 704], \\"count\\": 2}, \\"27\\": {\\"resolution\\": [384, 832], \\"count\\": 2}, \\"28\\": {\\"resolution\\": [448, 128], \\"count\\": 2}, \\"29\\": {\\"resolution\\": [448, 448], \\"count\\": 4}, \\"30\\": {\\"resolution\\": [448, 576], \\"count\\": 4}, \\"31\\": {\\"resolution\\": [448, 640], \\"count\\": 4}, \\"32\\": {\\"resolution\\": [448, 704], \\"count\\": 2}, \\"33\\": {\\"resolution\\": [448, 768], \\"count\\": 2}, \\"34\\": {\\"resolution\\": [512, 512], \\"count\\": 2}, \\"35\\": {\\"resolution\\": [512, 640], \\"count\\": 2}, \\"36\\": {\\"resolution\\": [512, 704], \\"count\\": 4}, \\"37\\": {\\"resolution\\": [512, 768], \\"count\\": 4}, \\"38\\": {\\"resolution\\": [512, 1024], \\"count\\": 2}, \\"39\\": {\\"resolution\\": [576, 704], \\"count\\": 2}, \\"40\\": {\\"resolution\\": [576, 768], \\"count\\": 4}, \\"41\\": {\\"resolution\\": [576, 1024], \\"count\\": 2}, \\"42\\": {\\"resolution\\": [704, 448], \\"count\\": 2}, \\"43\\": {\\"resolution\\": [704, 768], \\"count\\": 4}, \\"44\\": {\\"resolution\\": [704, 832], \\"count\\": 2}, \\"45\\": {\\"resolution\\": [704, 1024], \\"count\\": 2}, \\"46\\": {\\"resolution\\": [768, 576], \\"count\\": 2}, \\"47\\": {\\"resolution\\": [768, 768], \\"count\\": 2}, \\"48\\": {\\"resolution\\": [832, 576], \\"count\\": 2}, \\"49\\": {\\"resolution\\": [832, 832], \\"count\\": 2}, \\"50\\": {\\"resolution\\": [832, 1024], \\"count\\": 4}, \\"51\\": {\\"resolution\\": [896, 576], \\"count\\": 2}, \\"52\\": {\\"resolution\\": [896, 768], \\"count\\": 2}, \\"53\\": {\\"resolution\\": [960, 704], \\"count\\": 2}, \\"54\\": {\\"resolution\\": [960, 832], \\"count\\": 2}, \\"55\\": {\\"resolution\\": [960, 960], \\"count\\": 2}, \\"56\\": {\\"resolution\\": [1024, 704], \\"count\\": 2}, \\"57\\": {\\"resolution\\": [1024, 768], \\"count\\": 2}, \\"58\\": {\\"resolution\\": [1024, 1024], \\"count\\": 6}, \\"59\\": {\\"resolution\\": [1088, 704], \\"count\\": 4}, \\"60\\": {\\"resolution\\": [1088, 896], \\"count\\": 4}, \\"61\\": {\\"resolution\\": [1152, 768], \\"count\\": 4}, \\"62\\": {\\"resolution\\": [1216, 768], \\"count\\": 6}, \\"63\\": {\\"resolution\\": [1216, 832], \\"count\\": 2}, \\"64\\": {\\"resolution\\": [1280, 768], \\"count\\": 2}, \\"65\\": {\\"resolution\\": [1344, 768], \\"count\\": 10}, \\"66\\": {\\"resolution\\": [1408, 640], \\"count\\": 2}, \\"67\\": {\\"resolution\\": [1472, 576], \\"count\\": 2}}, \\"mean_img_ar_error\\": 0.04257648019652614}, \\"subsets\\": [{\\"img_count\\": 102, \\"num_repeats\\": 2, \\"color_aug\\": false, \\"flip_aug\\": false, \\"random_crop\\": false, \\"shuffle_caption\\": true, \\"keep_tokens\\": 0, \\"image_dir\\": \\"img\\", \\"class_tokens\\": null, \\"is_reg\\": false}]}]", "ss_clip_skip": "2", "ss_full_fp16": "False", "ss_optimizer": "prodigyopt.prodigy.Prodigy(decouple=True,weight_decay=0.5,betas=(0.9, 0.99),use_bias_correction=False)", "ss_num_epochs": "10", "ss_session_id": "3851886725", "modelspec.date": "2024-09-11T15:17:43", "ss_network_dim": "32", "ss_output_name": "Pepper__Carrot", "modelspec.title": "Pepper__Carrot", "ss_dataset_dirs": "{\\"img\\": {\\"n_repeats\\": 2, \\"img_count\\": 102}}", "ss_lr_scheduler": "cosine", "ss_noise_offset": "0.03", "sshs_model_hash": "52e53d98fe907d8b11eba16ce27575bea66ea987e2a1c0a8e9c2240909f01ff3", "ss_cache_latents": "True", "ss_learning_rate": "1.0", "ss_max_grad_norm": "1.0", "ss_min_snr_gamma": "5.0", "ss_network_alpha": "32", "ss_sd_model_hash": "e577480d", "ss_sd_model_name": "290640.safetensors", "ss_tag_frequency": {"img": {":d": 3, ":o": 1, "^^^": 2, "bag": 14, "bow": 2, "cat": 25, "cup": 6, "day": 9, "hat": 63, "hug": 1, "mug": 2, "sky": 7, "wet": 2, "1boy": 3, "belt": 2, "bird": 1, "boat": 1, "book": 16, "cape": 2, "cave": 1, "coin": 1, "door": 1, "fire": 4, "fish": 1, "food": 2, "fork": 1, "grin": 2, "hood": 1, "nude": 1, "rain": 1, "silk": 1, "solo": 63, "tray": 1, "tree": 6, "vest": 37, "1girl": 96, "angry": 1, "apron": 2, "armor": 1, "beach": 2, "blush": 19, "boots": 9, "braid": 2, "broom": 9, "chair": 2, "cloud": 5, "dirty": 1, "dress": 7, "flask": 1, "frown": 1, "grass": 3, "heart": 2, "horse": 1, "lying": 2, "mouse": 2, "navel": 1, "ocean": 1, "pants": 1, "paper": 2, "plaid": 2, "plant": 1, "quill": 2, "robot": 1, "shell": 1, "shirt": 17, "skirt": 28, "smile": 40, "socks": 12, "staff": 1, "steam": 2, "stick": 1, "sweat": 1, "sword": 2, "tears": 3, "teeth": 2, "water": 3, "witch": 2, "2girls": 1, "animal": 1, "arm up": 1, "basket": 2, "bikini": 3, "blurry": 1, "bottle": 2, "bubble": 1, "crying": 2, "flower": 1, "flying": 4, "forest": 4, "gloves": 3, "injury": 1, "nature": 5, "potion": 1, "rabbit": 1, "shorts": 3, "sketch": 2, "skewer": 1, "tattoo": 2, "weapon": 3, "window": 1, "airship": 1, "armband": 11, "bathing": 1, "breasts": 1, "falling": 1, "handbag": 4, "holding": 11, "hood up": 1, "indoors": 2, "jewelry": 1, "octopus": 1, "polearm": 1, "profile": 1, "railing": 1, "reading": 2, "running": 4, "sitting": 13, "striped": 1, "walking": 1, "barefoot": 2, "blue sky": 1, "earrings": 1, "feathers": 2, "forehead": 2, "freckles": 4, "kneeling": 1, "laughing": 1, "outdoors": 7, "portrait": 2, "red vest": 1, "sleeping": 1, "swimsuit": 4, "thinking": 1, "blue eyes": 8, "bookshelf": 2, "from side": 2, "greyscale": 5, "head rest": 2, "kneehighs": 1, "long hair": 40, "open book": 2, "polka dot": 3, "sidelocks": 1, "signature": 1, "straw hat": 3, "surprised": 5, "tentacles": 1, "wide-eyed": 5, "witch hat": 19, "air bubble": 1, "black eyes": 2, "black hair": 22, "board game": 1, "brown eyes": 16, "brown hair": 75, "brown vest": 2, "cowboy hat": 8, "from above": 1, "looking up": 1, "male focus": 2, "messy hair": 1, "monochrome": 5, "open mouth": 46, "short hair": 3, "sleeveless": 1, "solo focus": 1, "spider web": 1, "suspenders": 1, "under tree": 1, "underwater": 1, "upper body": 8, "watercraft": 1, "closed eyes": 10, "expressions": 1, "fingernails": 1, "from behind": 2, "green shirt": 1, "holding cup": 1, "leg warmers": 4, "loose socks": 3, "motion blur": 1, "purple hair": 1, "speed lines": 1, "spiked hair": 3, "white dress": 2, "white shirt": 11, "against tree": 1, "broom riding": 5, "closed mouth": 7, "crossed arms": 1, "holding book": 3, "indian style": 1, "long sleeves": 8, "off shoulder": 2, "torn clothes": 2, "covering face": 1, "hands on hips": 2, "holding paper": 1, "holding sword": 1, "messenger bag": 1, "multiple boys": 1, "playing games": 1, "two-tone hair": 1, "bare shoulders": 2, "brown headwear": 1, "clenched teeth": 1, "holding weapon": 1, "multiple girls": 3, "multiple views": 1, "one eye closed": 2, "blue background": 2, "floating island": 1, "reference sheet": 1, "brown background": 1, "detached sleeves": 1, "hand on own chin": 1, "polka dot bikini": 2, "white background": 4, "blurry background": 1, "hand to own mouth": 1, "looking at viewer": 9, "multicolored hair": 1, "orange background": 1, "simple background": 5, "sleeves rolled up": 1, "v-shaped eyebrows": 1, "off-shoulder dress": 1, "looking to the side": 1}}, "sshs_legacy_hash": "091bd199", "ss_ip_noise_gamma": "None", "ss_network_module": "networks.lora", "ss_num_reg_images": "0", "ss_lr_warmup_steps": "0", "ss_max_train_steps": "740", "ss_mixed_precision": "bf16", "ss_network_dropout": "None", "ss_text_encoder_lr": "1.0", "ss_max_token_length": "225", "ss_num_train_images": "204", "ss_training_comment": "None", "modelspec.resolution": "1024x1024", "ss_new_sd_model_hash": "67ab2fd8ec439a89b3fedb15cc65f54336af163c7eb5e4f2acc98f090a29b0b3", "ss_prior_loss_weight": "1.0", "ss_zero_terminal_snr": "False", "ss_base_model_version": "sdxl_base_v1-0", "ss_scale_weight_norms": "None", "modelspec.architecture": "stable-diffusion-xl-v1-base/lora", "ss_debiased_estimation": "False", "ss_face_crop_aug_range": "None", "ss_training_started_at": "1726066908.2484195", "modelspec.encoder_layer": "2", "ss_adaptive_noise_scale": "None", "ss_caption_dropout_rate": "0.0", "ss_training_finished_at": "1726067863.29673", "modelspec.implementation": "https://github.com/Stability-AI/generative-models", "modelspec.sai_model_spec": "1.0.0", "ss_num_batches_per_epoch": "74", "modelspec.prediction_type": "epsilon", "ss_gradient_checkpointing": "True", "ss_sd_scripts_commit_hash": "f9317052edb4ab3b3c531ac3b28825ee78b4a966", "ss_multires_noise_discount": "0.3", "ss_caption_tag_dropout_rate": "0.0", "ss_multires_noise_iterations": "6", "ss_gradient_accumulation_steps": "1", "ss_caption_dropout_every_n_epochs": "0"}'
        : null, // headerData // TODO
      randw([
        { value: null, weight: 100 },
        { value: faker.word.noun(), weight: 1 },
      ]), // overrideName
    ];
    ret.push(row);
  }
  return ret;
};

/**
 * ResourceReview
 */
const genReviews = (num: number, userIds: number[], mvData: { id: number; modelId: number }[]) => {
  const ret: (number | boolean | null | string)[][] = [];

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const isGood = fbool();
    const mv = rand(mvData);
    const existUsers = ret.filter((r) => r[1] === mv.id).map((r) => r[4] as number);

    const row = [
      step, // id
      mv.id, // modelVersionId
      isGood ? 5 : 1, // rating
      randw([
        { value: null, weight: 10 },
        { value: faker.lorem.sentence(), weight: 1 },
      ]), // details
      rand(without(userIds, ...existUsers)), // userId
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
      fbool(0.01), // exclude
      null, // metadata // TODO do we need things like "reviewIds" and "migrated"?
      mv.modelId, // modelId
      fbool(0.03), // nsfw
      fbool(0.01), // tosViolation
      isGood, // recommended
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * Tool
 */
const genTools = (num: number) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const name = faker.company.name();
    const page = faker.internet.url();

    const row = [
      step, // id
      name, // name
      null, // icon // TODO image
      created, // createdAt
      rand(Object.values(ToolType)), // type
      fbool(0.9), // enabled
      randw([
        { value: null, weight: 1 },
        {
          value:
            page +
            randw([
              { value: '', weight: 5 },
              { value: '/stuff', weight: 1 },
            ]),
          weight: 5,
        },
      ]), // domain
      randw([
        { value: null, weight: 1 },
        { value: faker.lorem.paragraph({ min: 1, max: 4 }), weight: 5 },
      ]), // description
      randw([
        { value: null, weight: 1 },
        { value: page, weight: 5 },
      ]), // homepage
      rand([null, name]), // company
      null, // priority
      '{}', // metadata
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * Technique
 */
const genTechniques = () => {
  return [
    [1, 'txt2img', '2024-05-20 22:00:06.478', true, 'Image'],
    [2, 'img2img', '2024-05-20 22:00:06.478', true, 'Image'],
    [3, 'inpainting', '2024-05-20 22:00:06.478', true, 'Image'],
    [4, 'workflow', '2024-05-20 22:00:06.478', true, 'Image'],
    [5, 'vid2vid', '2024-05-20 22:00:06.478', true, 'Video'],
    [6, 'txt2vid', '2024-05-20 22:00:06.478', true, 'Video'],
    [7, 'img2vid', '2024-05-20 22:00:06.478', true, 'Video'],
    [8, 'controlnet', '2024-06-04 16:31:37.241', true, 'Image'],
  ];
};

/**
 * Collection
 */
const genCollections = (num: number, userIds: number[], imageIds: number[]) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();

    const row = [
      step, // id
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
      `${rand(['My', 'Some'])} ${faker.word.adjective()} ${faker.word.noun()}s`, // name
      rand([null, '', faker.lorem.sentence()]), // description
      rand(userIds), // userId
      fbool(0.95) ? 'Private' : rand(['Public', 'Review']), // write
      fbool(0.05) ? 'Unlisted' : rand(['Public', 'Private']), // read
      rand(Object.values(CollectionType).filter((ct) => ct !== 'Post')), // type // TODO add back post
      randw([
        { value: null, weight: 1000 },
        { value: rand(imageIds), weight: 1 },
      ]), // imageId
      fbool(0.4), // nsfw
      // randw([
      //   // { value: 'Bookmark', weight: 1000 }, // no need for this
      //   { value: null, weight: 100 },
      //   { value: 'Contest', weight: 1 },
      // ]), // mode
      null, // mode
      '{}', // metadata
      randw([
        { value: 'Public', weight: 10 },
        { value: 'Unsearchable', weight: 1 },
      ]), // availability
      randw([
        { value: 0, weight: 10 },
        { value: 31, weight: 4 },
        { value: 28, weight: 3 },
        { value: 1, weight: 2 },
        { value: 15, weight: 1 },
      ]), // nsfwLevel // TODO why are there values above 31?
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * CollectionItem
 */
const genCollectionItems = (
  num: number,
  collectionData: { id: number; type: CollectionType }[],
  articleIds: number[],
  postIds: number[],
  imageIds: number[],
  modelIds: number[],
  userIds: number[]
) => {
  const ret: (number | boolean | null | string)[][] = [];

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const collection = rand(collectionData);
    const status = randw([
      { value: 'ACCEPTED', weight: 10000 },
      { value: 'REJECTED', weight: 10 },
      { value: 'REVIEW', weight: 1 },
    ]);
    const isReviewed = fbool(0.001);
    const exist = ret.filter((r) => r[3] === collection.id);

    const row = [
      step, // id
      created, // createdAt
      rand([null, created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
      collection.id, // collectionId
      collection.type === 'Article'
        ? rand(without(articleIds, ...exist.map((e) => e[4] as number)))
        : null, // articleId
      collection.type === 'Post'
        ? rand(without(postIds, ...exist.map((e) => e[5] as number)))
        : null, // postId
      collection.type === 'Image'
        ? rand(without(imageIds, ...exist.map((e) => e[6] as number)))
        : null, // imageId
      collection.type === 'Model'
        ? rand(without(modelIds, ...exist.map((e) => e[7] as number)))
        : null, // modelId
      rand([null, rand(userIds)]), // addedById
      null, // note
      status, // status
      null, // randomId
      isReviewed ? faker.date.between({ from: created, to: Date.now() }).toISOString() : null, // reviewedAt
      isReviewed ? rand(userIds) : null, // reviewedById
      null, // tagId
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * Post
 */
const genPosts = (
  num: number,
  userIds: number[],
  mvData: { id: number; modelId: number; userId?: number }[]
) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const isPublished = fbool(0.8);

    const mv = rand(mvData);
    const mvId = rand([null, mv.id]);
    const userId = mvId ? mv.userId ?? rand(userIds) : rand(userIds);

    const row = [
      step, // id
      fbool(0.4), // nsfw // 40% actually seems fair :/
      rand([null, `${faker.word.adjective()} ${faker.word.adjective()} ${faker.word.noun()}`]), // title
      rand([null, `<p>${faker.lorem.sentence()}</p>`]), // detail
      userId, // userId
      mvId, // modelVersionId
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
      !isPublished ? null : faker.date.between({ from: created, to: Date.now() }).toISOString(), // publishedAt
      !isPublished ? null : `{"imageNsfw": "${rand(Object.values(NsfwLevel))}"}`, // metadata
      fbool(0.01), // tosViolation
      null, // collectionId // TODO
      randw([
        { value: 'Public', weight: 30 },
        {
          value: rand(
            Object.values(Availability).filter((v) => !['Public', 'EarlyAccess'].includes(v))
          ),
          weight: 1,
        },
      ]), // availability
      fbool(0.01), // unlisted
      randw([
        { value: 0, weight: 1 },
        { value: 1, weight: 6 },
        { value: 4, weight: 2 },
        { value: 8, weight: 3 },
        { value: 16, weight: 4 },
      ]), // nsfwLevel
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * Image
 */
const genImages = (num: number, userIds: number[], postIds: number[]) => {
  const ret = [];

  // TODO try to use the s3 uploaded URLs

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const type = randw([
      { value: 'image', weight: 20 },
      { value: 'video', weight: 4 },
      // { value: 'audio', weight: 1 }, // not using audio
    ]);
    const mime = type === 'image' ? rand(IMAGE_MIME_TYPE) : rand(VIDEO_MIME_TYPE);
    const ext = mime.split('/').pop();
    const width = rand([128, 256, 512, 768, 1024, 1920]);
    const height = rand([128, 256, 512, 768, 1024, 1920]);
    const isGenned = fbool();
    const imageUrl = faker.image.url({ width, height });

    // TODO getting a proper blurhash sucks and nothing works
    // let hash = faker.string.sample(36);
    // hash = hash.replace(/[\\"']/g, '_');
    // const file = await getUrlAsFile(imageUrl);
    // const meta = file ? await preprocessFile(file) : null;
    const hash = null;

    const row = [
      `${capitalize(faker.word.adjective())}-${capitalize(
        faker.word.noun()
      )}-${faker.number.int()}.${ext}`, // name
      imageUrl, // url
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
      hash, // hash
      step, // id
      rand(userIds), // userId
      height, // height
      width, // width
      !isGenned
        ? null
        : `{"Size": "${width}x${height}", "seed": ${faker.string.numeric({
            length: 10,
            allowLeadingZeros: false,
          })}, "steps": ${faker.number.int(
            100
          )}, "prompt": "${faker.lorem.sentence()}", "sampler": "${rand(
            constants.samplers
          )}", "cfgScale": ${faker.number.int(10)}, "clipSkip": ${rand([
            0, 1, 2,
          ])}, "resources": ${randw([
            { value: '[]', weight: 5 },
            {
              value: `[{"name": "${faker.word.noun()}", "type": "lora", "weight": 0.95}]`,
              weight: 1,
            },
          ])}, "Created Date": "${created}", "negativePrompt": "bad stuff", "civitaiResources": [{"type": "checkpoint", "modelVersionId": 272376, "modelVersionName": "1.0"}]}`, // meta
      fbool(0.01), // tosViolation
      null, // analysis
      isGenned ? rand(Object.values(ImageGenerationProcess)) : null, // generationProcess
      null, // featuredAt
      fbool(0.05), // hideMeta
      faker.number.int(20), // index
      mime, // mimeType
      randw([
        { value: null, weight: 1 },
        { value: rand(postIds), weight: 10 },
      ]), // postId
      faker.date.between({ from: created, to: Date.now() }).toISOString(), // scanRequestedAt
      faker.date.between({ from: created, to: Date.now() }).toISOString(), // scannedAt
      null, // sizeKb
      rand(Object.values(NsfwLevel)), // nsfw
      null, // blockedFor
      'Scanned', // ingestion
      null, // needsReview
      type === 'image'
        ? `{"hash": "${hash}", "size": ${faker.number.int(
            1_000_000
          )}, "width": ${width}, "height": ${height}}`
        : `{"hash": "${hash}", "size": ${faker.number.int(
            1_000_000
          )}, "width": ${width}, "height": ${height}, "audio": ${fbool(
            0.2
          )}, "duration": ${faker.number.float(30)}}`, // metadata
      type, // type
      '{"wd14": "20279865", "scans": {"WD14": 1716391779426, "Rekognition": 1716391774556}, "rekognition": "20279864", "common-conversions": "20279863"}', // scanJobs
      randw([
        { value: 0, weight: 1 },
        { value: 1, weight: 6 },
        { value: 4, weight: 2 },
        { value: 8, weight: 3 },
        { value: 16, weight: 4 },
      ]), // nsfwLevel
      fbool(0.05), // nsfwLevelLocked
      randw([
        { value: 0, weight: 1 },
        { value: 1, weight: 6 },
        { value: 4, weight: 2 },
        { value: 8, weight: 3 },
        { value: 16, weight: 4 },
      ]), // aiNsfwLevel
      'urn:air:mixture:model:huggingface:Civitai/mixtureMovieRater', // aiModel
      created, // sortAt
      -1 * faker.number.int({ min: 1e12 }), // pHash // this is actually a bigInt but faker does weird stuff
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * Article
 */
const genArticles = (num: number, userIds: number[], imageIds: number[]) => {
  const ret = [];

  let usableImageIds = imageIds;

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const coverId = rand(usableImageIds);
    usableImageIds = without(usableImageIds, coverId);

    const row = [
      step, // id
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
      fbool(0.2), // nsfw
      fbool(0.01), // tosViolation
      null, // metadata
      faker.lorem.sentence(), // title
      `<p>${faker.lorem.paragraphs({ min: 1, max: 10 }, '<br/>')}</p>`, // content
      rand([null, '']), // cover // TODO with images
      rand([null, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // publishedAt
      rand(userIds), // userId
      randw([
        { value: 'Public', weight: 30 },
        {
          value: rand(
            Object.values(Availability).filter((v) => !['Public', 'EarlyAccess'].includes(v))
          ),
          weight: 1,
        },
      ]), // availability
      fbool(0.01), // unlisted
      coverId, // coverId
      randw([
        { value: 0, weight: 1 },
        { value: 1, weight: 4 },
        { value: 28, weight: 3 },
        { value: 15, weight: 2 },
        { value: 31, weight: 2 },
      ]), // nsfwLevel
      randw([
        { value: 0, weight: 6 },
        { value: 1, weight: 4 },
        { value: 28, weight: 3 },
        { value: 15, weight: 2 },
        { value: 31, weight: 2 },
      ]), // userNsfwLevel
      randw([
        { value: '{}', weight: 6 },
        { value: '{userNsfwLevel}', weight: 1 },
      ]), // lockedProperties
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * ImageTool
 */
const genImageTools = (num: number, imageIds: number[], toolIds: number[]) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const imageId = rand(imageIds);
    const existTools: number[] = ret.filter((r) => r[0] === imageId).map((r) => r[1] as number);
    const toolId = rand(without(toolIds, ...existTools));

    const row = [
      imageId, // imageId
      toolId, // toolId
      null, // notes
      created, // createdAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * ImageTechnique
 */
const genImageTechniques = (num: number, imageIds: number[], techniqueIds: number[]) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const imageId = rand(imageIds);
    const existTechs: number[] = ret.filter((r) => r[0] === imageId).map((r) => r[1] as number);
    const techId = rand(without(techniqueIds, ...existTechs));

    const row = [
      imageId, // imageId
      techId, // techniqueId
      randw([
        { value: null, weight: 20 },
        { value: faker.lorem.sentence(), weight: 1 },
      ]), // notes
      created, // createdAt
    ];

    ret.push(row);
  }
  return ret;
};

const genTags = (num: number) => {
  const ret = [
    [
      'anime',
      null,
      '2023-02-18 02:41:35.011',
      '2023-03-11 08:58:19.316',
      1,
      '{Model,Question,Image,Post}',
      false,
      true,
      false,
      'Label',
      'None',
      false,
      1,
    ],
    [
      'woman',
      null,
      '2023-02-17 18:05:45.976',
      '2023-05-02 05:15:29.764',
      2,
      '{Model,Image,Post,Question}',
      false,
      true,
      false,
      'Label',
      'None',
      false,
      1,
    ],
    [
      'photography',
      null,
      '2023-02-17 18:42:12.828',
      '2024-01-18 21:42:41.591',
      3,
      '{Model,Image,Post,Question}',
      false,
      true,
      false,
      'Label',
      'None',
      false,
      1,
    ],
    [
      'celebrity',
      null,
      '2023-02-17 18:42:12.828',
      '2023-03-03 22:03:56.586',
      4,
      '{Model,Image,Question,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'subject',
      null,
      '2022-11-12 21:57:05.708',
      '2022-11-12 21:57:05.708',
      5,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'hentai',
      null,
      '2023-02-17 18:42:12.828',
      '2023-02-17 18:42:12.828',
      6,
      '{Model,Image,Post}',
      false,
      true,
      true,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'character',
      null,
      '2023-02-18 02:41:35.011',
      '2023-02-18 02:55:57.727',
      7,
      '{Model,Question,Image,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'porn',
      null,
      '2023-02-17 19:02:56.629',
      '2023-02-17 19:02:56.629',
      8,
      '{Model,Image,Post}',
      false,
      true,
      true,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'animals',
      null,
      '2022-11-04 17:59:01.748',
      '2022-11-04 17:59:01.748',
      9,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'retro',
      null,
      '2022-11-30 09:51:50.239',
      '2022-11-30 09:51:50.239',
      10,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'food',
      null,
      '2023-02-11 12:49:13.847',
      '2023-03-11 09:35:57.749',
      11,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'Label',
      'None',
      false,
      1,
    ],
    [
      '3d',
      null,
      '2022-11-04 19:46:47.389',
      '2022-11-04 19:46:47.389',
      12,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'scifi',
      null,
      '2022-12-26 03:02:24.520',
      '2022-12-26 03:02:24.520',
      13,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'graphic design',
      null,
      '2023-02-17 03:23:59.457',
      '2023-02-17 03:23:59.457',
      14,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'landscapes',
      null,
      '2022-11-04 17:36:59.422',
      '2022-11-04 17:36:59.422',
      15,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'man',
      null,
      '2023-02-17 18:42:12.828',
      '2023-03-11 08:42:56.790',
      16,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'Label',
      'None',
      false,
      1,
    ],
    [
      'meme',
      null,
      '2022-11-30 02:50:49.164',
      '2023-11-18 12:02:18.061',
      17,
      '{Model,Image,Post,Question}',
      false,
      true,
      true,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'video game',
      null,
      '2023-02-17 18:42:12.828',
      '2023-02-17 18:42:12.828',
      18,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'furry',
      null,
      '2023-02-17 18:12:44.997',
      '2023-02-17 18:12:44.997',
      19,
      '{Model,Image,Post}',
      false,
      true,
      true,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'groteseque',
      null,
      '2023-02-17 18:42:12.828',
      '2023-02-17 18:42:12.828',
      20,
      '{Model,Image,Post}',
      false,
      true,
      true,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'illustration',
      null,
      '2023-02-17 18:13:02.026',
      '2023-02-17 18:13:02.026',
      21,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'fantasy',
      null,
      '2023-02-17 18:42:12.828',
      '2023-02-17 18:42:12.828',
      22,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'architecture',
      null,
      '2022-12-15 01:17:05.065',
      '2023-03-11 09:20:31.396',
      23,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'Label',
      'None',
      false,
      1,
    ],
    [
      'horror',
      null,
      '2022-11-09 23:08:24.969',
      '2022-11-09 23:08:24.969',
      24,
      '{Model,Image,Post}',
      false,
      true,
      true,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'cartoon',
      null,
      '2023-02-17 18:42:12.828',
      '2023-03-11 09:43:10.712',
      25,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'Label',
      'None',
      false,
      1,
    ],
    [
      'cars',
      null,
      '2023-02-17 18:42:12.828',
      '2023-02-17 18:42:12.828',
      26,
      '{Model,Image,Post}',
      false,
      true,
      false,
      'UserGenerated',
      'None',
      false,
      1,
    ],
    [
      'image category',
      null,
      '2023-03-24 23:13:52.715',
      '2023-03-24 23:13:52.715',
      27,
      '{Tag}',
      false,
      false,
      false,
      'System',
      'None',
      false,
      1,
    ],
    [
      'model category',
      null,
      '2023-03-24 23:13:52.715',
      '2023-03-24 23:13:52.715',
      28,
      '{Tag}',
      false,
      false,
      false,
      'System',
      'None',
      false,
      1,
    ],
    [
      'post category',
      null,
      '2023-03-24 23:13:52.715',
      '2023-03-24 23:13:52.715',
      29,
      '{Tag}',
      false,
      false,
      false,
      'System',
      'None',
      false,
      1,
    ],
    [
      'contest',
      null,
      '2023-05-03 16:54:55.704',
      '2023-12-02 11:35:33.324',
      30,
      '{Tag,Post,Question}',
      false,
      false,
      false,
      'System',
      'None',
      false,
      1,
    ],
    [
      'article category',
      null,
      '2023-05-12 21:43:26.532',
      '2023-05-12 21:43:26.532',
      31,
      '{Tag}',
      false,
      false,
      false,
      'System',
      'None',
      false,
      1,
    ],
  ];

  const retLen = ret.length;
  const seenNames = ret.map((r) => r[0] as string);

  for (let step = retLen + 1; step <= retLen + num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    let name = rand([faker.word.noun(), `${faker.word.adjective()} ${faker.word.noun()}`]);
    if (seenNames.includes(name)) name = `${name} ${faker.number.int(1_000)}`;
    seenNames.push(name);

    const row = [
      name, // name
      null, // color
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
      step, // id
      randw([
        { value: '{Image,Model,Post}', weight: 1 },
        { value: '{Post}', weight: 10 },
        { value: '{Model,Post}', weight: 5 },
        { value: '{Model}', weight: 5 },
        { value: '{Image}', weight: 2 },
      ]), // target
      fbool(0.001), // unlisted
      false, // isCategory
      fbool(0.001), // unfeatured
      randw([
        { value: TagType.System, weight: 5 },
        { value: TagType.Moderation, weight: 30 },
        { value: TagType.Label, weight: 7500 },
        { value: TagType.UserGenerated, weight: 150000 },
      ]), // type
      'None', // nsfw
      false, // adminOnly
      1, // nsfwLevel
    ];

    ret.push(row);
  }
  return ret;
};

// TODO these tags should probably be looking at the "target"

/**
 * TagsOnArticle
 */
const genTagsOnArticles = (num: number, tagIds: number[], articleIds: number[]) => {
  const ret: (number | boolean | null | string)[][] = [];

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const articleId = rand(articleIds);
    const existTags = ret.filter((r) => (r[0] as number) === articleId).map((r) => r[1] as number);

    const row = [
      articleId, // articleId
      rand(without(tagIds, ...existTags)), // tagId
      created, // createdAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * TagsOnPost
 */
const genTagsOnPosts = (num: number, tagIds: number[], postIds: number[]) => {
  const ret: (number | boolean | null | string)[][] = [];

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const postId = rand(postIds);
    const existTags = ret.filter((r) => (r[0] as number) === postId).map((r) => r[1] as number);

    const row = [
      postId, // postId
      rand(without(tagIds, ...existTags)), // tagId
      created, // createdAt
      null, // confidence
      false, // disabled
      false, // needsReview
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * TagsOnImage
 */
const genTagsOnImages = (num: number, tagIds: number[], imageIds: number[]) => {
  const ret: (number | boolean | null | string)[][] = [];

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const isAutomated = fbool();
    const isDisabled = fbool(0.01);
    const imageId = rand(imageIds);
    const existTags = ret.filter((r) => (r[0] as number) === imageId).map((r) => r[1] as number);

    const row = [
      imageId, // imageId
      rand(without(tagIds, ...existTags)), // tagId
      created, // createdAt
      isAutomated, // automated
      isAutomated ? faker.number.int(99) : null, // confidence
      isDisabled, // disabled
      false, // needsReview
      isDisabled ? faker.date.between({ from: created, to: Date.now() }).toISOString() : null, // disabledAt
      isAutomated
        ? rand([TagSource.WD14, TagSource.Rekognition, TagSource.Computed])
        : TagSource.User, // source
      'Voted', // tagDisabledReason
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * TagsOnModels
 */
const genTagsOnModels = (num: number, tagIds: number[], modelIds: number[]) => {
  const ret: (number | boolean | null | string)[][] = [];

  for (let step = 1; step <= num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();
    const modelId = rand(modelIds);
    const existTags = ret.filter((r) => (r[0] as number) === modelId).map((r) => r[1] as number);

    const row = [
      modelId, // modelId
      rand(without(tagIds, ...existTags)), // tagId
      created, // createdAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * Comment
 */
const genCommentsModel = (
  num: number,
  userIds: number[],
  modelIds: number[],
  parentIds: number[],
  doThread = false,
  startId = 0
) => {
  const ret = [];

  for (let step = startId + 1; step <= startId + num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();

    const row = [
      step, // id
      `<p>${faker.lorem.paragraph({ min: 1, max: 8 })}</p>`, // content
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
      fbool(0.01), // nsfw
      fbool(0.01), // tosViolation
      doThread ? rand(parentIds) : null, // parentId
      rand(userIds), // userId
      rand(modelIds), // modelId
      fbool(0.01), // locked
      fbool(0.01), // hidden
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * Thread
 */
const genThreads = (
  num: number,
  imageIds: number[],
  postIds: number[],
  reviewIds: number[],
  articleIds: number[],
  commentIds: number[],
  parentIds: number[],
  doThread = false,
  startId = 0
) => {
  const ret = [];

  const seenImageIds: number[] = [];
  const seenPostIds: number[] = [];
  const seenReviewIds: number[] = [];
  const seenArticleIds: number[] = [];

  const parentIdxs = range(parentIds.length);

  for (let step = startId + 1; step <= startId + num; step++) {
    const type = rand(['image', 'post', 'review', 'article']); // TODO bounty, bountyEntry

    const imageId = type === 'image' && !doThread ? rand(without(imageIds, ...seenImageIds)) : null;
    const postId = type === 'post' && !doThread ? rand(without(postIds, ...seenPostIds)) : null;
    const reviewId =
      type === 'review' && !doThread ? rand(without(reviewIds, ...seenReviewIds)) : null;
    const articleId =
      type === 'article' && !doThread ? rand(without(articleIds, ...seenArticleIds)) : null;

    const parentIdx = doThread ? rand(parentIdxs) : 0;
    if (doThread) pull(parentIdxs, parentIdx);
    const parentId = doThread ? parentIds[parentIdx] : null;
    const commentId = doThread ? commentIds[parentIdx] : null;

    if (imageId) seenImageIds.push(imageId);
    if (postId) seenPostIds.push(postId);
    if (reviewId) seenReviewIds.push(reviewId);
    if (articleId) seenArticleIds.push(articleId);

    const row = [
      step, // id
      fbool(0.01), // locked
      null, // questionId
      null, // answerId
      imageId, // imageId
      postId, // postId
      reviewId, // reviewId
      '{}', // metadata // TODO do we need "reviewIds" here?
      null, // modelId
      commentId, // commentId
      articleId, // articleId
      null, // bountyEntryId // TODO
      null, // bountyId // TODO
      null, // clubPostId
      parentId, // parentThreadId
      parentId, // rootThreadId
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * CommentV2
 */
const genCommentsV2 = (num: number, userIds: number[], threadIds: number[], startId = 0) => {
  const ret = [];

  for (let step = startId + 1; step <= startId + num; step++) {
    const created = faker.date.past({ years: 3 }).toISOString();

    const row = [
      step, // id
      `<p>${faker.lorem.paragraph({ min: 1, max: 8 })}</p>`, // content
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
      fbool(0.01), // nsfw
      fbool(0.01), // tosViolation
      rand(userIds), // userId
      rand(threadIds), // threadId
      null, // metadata // TODO need "oldId"?
      fbool(0.005), // hidden
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * ImageResource
 */
const genImageResources = (num: number, mvIds: number[], imageIds: number[]) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    const isModel = fbool(0.9);

    const row = [
      step, // id
      isModel ? rand(mvIds) : null, // modelVersionId
      isModel
        ? rand(['lora', 'checkpoint', 'embed', null])
        : `${faker.word.adjective()}_${faker.word.noun()}`, // name
      rand(imageIds), // imageId
      fbool(0.95), // detected
      randw([
        { value: null, weight: 9 },
        {
          value: faker.string.hexadecimal({
            length: 12,
            casing: 'lower',
            prefix: '',
          }),
          weight: 1,
        },
      ]), // hash
      randw([
        { value: null, weight: 1 },
        { value: faker.number.int(100), weight: 12 },
      ]), // strength
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * ArticleEngagement
 */
const genArticleEngagements = (num: number, userIds: number[], articleIds: number[]) => {
  const ret: (number | boolean | null | string)[][] = [];

  for (let step = 1; step <= num; step++) {
    // nb not quite right, would need created of entity, but being lazy here
    const created = faker.date.past({ years: 3 }).toISOString();
    const userId = rand(userIds);
    const existIds = ret.filter((r) => (r[0] as number) === userId).map((r) => r[1] as number);

    const row = [
      userId, // userId
      rand(without(articleIds, ...existIds)), // articleId
      rand(Object.values(ArticleEngagementType)), // type
      created, // createdAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * ImageEngagement
 */
const genImageEngagements = (num: number, userIds: number[], imageIds: number[]) => {
  const ret: (number | boolean | null | string)[][] = [];

  for (let step = 1; step <= num; step++) {
    // nb not quite right, would need created of entity, but being lazy here
    const created = faker.date.past({ years: 3 }).toISOString();
    const userId = rand(userIds);
    const existIds = ret.filter((r) => (r[0] as number) === userId).map((r) => r[1] as number);

    const row = [
      userId, // userId
      rand(without(imageIds, ...existIds)), // imageId
      rand(Object.values(ImageEngagementType)), // type
      created, // createdAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * ModelEngagement
 */
const genModelEngagements = (num: number, userIds: number[], modelIds: number[]) => {
  const ret: (number | boolean | null | string)[][] = [];

  for (let step = 1; step <= num; step++) {
    // nb not quite right, would need created of entity, but being lazy here
    const created = faker.date.past({ years: 3 }).toISOString();
    const userId = rand(userIds);
    const existIds = ret.filter((r) => (r[0] as number) === userId).map((r) => r[1] as number);

    const row = [
      userId, // userId
      rand(without(modelIds, ...existIds)), // modelId
      rand(Object.values(ModelEngagementType)), // type
      created, // createdAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * ModelVersionEngagement
 */
const genModelVersionEngagements = (num: number, userIds: number[], mvIds: number[]) => {
  const ret: (number | boolean | null | string)[][] = [];

  for (let step = 1; step <= num; step++) {
    // nb not quite right, would need created of entity, but being lazy here
    const created = faker.date.past({ years: 3 }).toISOString();
    const userId = rand(userIds);
    const existIds = ret.filter((r) => (r[0] as number) === userId).map((r) => r[1] as number);

    const row = [
      userId, // userId
      rand(without(mvIds, ...existIds)), // modelVersionId
      rand(Object.values(ModelVersionEngagementType)), // type
      created, // createdAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * TagEngagement
 */
const genTagEngagements = (num: number, userIds: number[], tagIds: number[]) => {
  const ret: (number | boolean | null | string)[][] = [];

  for (let step = 1; step <= num; step++) {
    // nb not quite right, would need created of entity, but being lazy here
    const created = faker.date.past({ years: 3 }).toISOString();
    const userId = rand(userIds);
    const existIds = ret.filter((r) => (r[0] as number) === userId).map((r) => r[1] as number);

    const row = [
      userId, // userId
      rand(without(tagIds, ...existIds)), // tagId
      rand(Object.values(TagEngagementType)), // type
      created, // createdAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * UserEngagement
 */
const genUserEngagements = (num: number, userIds: number[], targetUserIds: number[]) => {
  const ret: (number | boolean | null | string)[][] = [];

  for (let step = 1; step <= num; step++) {
    // nb not quite right, would need created of entity, but being lazy here
    const created = faker.date.past({ years: 3 }).toISOString();
    const userId = rand(userIds);
    const existIds = ret.filter((r) => (r[0] as number) === userId).map((r) => r[1] as number);

    const row = [
      userId, // userId
      rand(without(targetUserIds, ...existIds)), // targetUserId
      rand(Object.values(UserEngagementType)), // type
      created, // createdAt
    ];

    ret.push(row);
  }
  return ret;
};

const reactions = Object.values(ReviewReactions).filter((r) => r !== 'Dislike');

/**
 * ArticleReaction
 */
const genArticleReactions = (num: number, userIds: number[], articleIds: number[]) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    // nb not quite right, would need created of entity, but being lazy here
    const created = faker.date.past({ years: 3 }).toISOString();

    const row = [
      step, // id
      rand(articleIds), // articleId
      rand(userIds), // userId
      rand(reactions), // reaction
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * CommentReaction
 */
const genCommentReactions = (num: number, userIds: number[], commentIds: number[]) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    // nb not quite right, would need created of entity, but being lazy here
    const created = faker.date.past({ years: 3 }).toISOString();

    const row = [
      step, // id
      rand(commentIds), // commentId
      rand(userIds), // userId
      rand(reactions), // reaction
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * CommentV2Reaction
 */
const genCommentV2Reactions = (num: number, userIds: number[], commentIds: number[]) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    // nb not quite right, would need created of entity, but being lazy here
    const created = faker.date.past({ years: 3 }).toISOString();

    const row = [
      step, // id
      rand(commentIds), // commentId
      rand(userIds), // userId
      rand(reactions), // reaction
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * ImageReaction
 */
const genImageReactions = (num: number, userIds: number[], imageIds: number[]) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    // nb not quite right, would need created of entity, but being lazy here
    const created = faker.date.past({ years: 3 }).toISOString();

    const row = [
      step, // id
      rand(imageIds), // imageId
      rand(userIds), // userId
      rand(reactions), // reaction
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * PostReaction
 */
const genPostReactions = (num: number, userIds: number[], postIds: number[]) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    // nb not quite right, would need created of entity, but being lazy here
    const created = faker.date.past({ years: 3 }).toISOString();

    const row = [
      step, // id
      rand(postIds), // postId
      rand(userIds), // userId
      rand(reactions), // reaction
      created, // createdAt
      rand([created, faker.date.between({ from: created, to: Date.now() }).toISOString()]), // updatedAt
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * HomeBlock
 */
const genHomeBlocks = (collectionData: { id: number; type: CollectionType }[]) => {
  // id, "createdAt", "updatedAt", "userId", metadata, index, type, permanent, "sourceId"

  const collectModel = collectionData.filter((c) => c.type === 'Model').map((c) => c.id);
  const collectImage = collectionData.filter((c) => c.type === 'Image').map((c) => c.id);
  const collectPost = collectionData.filter((c) => c.type === 'Post').map((c) => c.id);
  const collectArticle = collectionData.filter((c) => c.type === 'Article').map((c) => c.id);

  if (!collectModel.length) collectModel.push(1);
  if (!collectImage.length) collectImage.push(1);
  if (!collectPost.length) collectPost.push(1);
  if (!collectArticle.length) collectArticle.push(1);

  return [
    [
      2,
      '2023-07-25 18:13:12.053',
      null,
      -1,
      '{"title": "Announcements", "announcements": {"limit": 4}}',
      -1,
      'Announcement',
      true,
      null,
    ],
    [
      1,
      '2023-07-25 18:13:12.053',
      null,
      -1,
      `{"link": "/models", "title": "Featured Models", "linkText": "Explore all models", "withIcon": true, "collection": {"id": ${rand(
        collectModel
      )}, "rows": 2, "limit": 8}, "description": "A filtered list of all models on the site, to view the complete model list click Explore All Models."}`,
      3,
      'Collection',
      false,
      null,
    ],
    [
      3,
      '2023-07-25 18:13:12.053',
      null,
      -1,
      `{"link": "/images", "title": "Featured Images", "linkText": "Explore all images", "withIcon": true, "collection": {"id": ${rand(
        collectImage
      )}, "rows": 2, "limit": 8}, "description": "All sorts of cool pictures created by our community, from simple shapes to detailed landscapes or human faces. A virtual canvas where you can unleash your creativity or get inspired."}`,
      1,
      'Collection',
      false,
      null,
    ],
    [
      5,
      '2023-07-25 18:13:12.053',
      null,
      -1,
      `{"link": "/posts", "title": "Featured Posts", "linkText": "Explore all posts", "withIcon": true, "collection": {"id": ${rand(
        collectPost
      )}, "limit": 8}, "description": "Find groups of pictures created by our community, using specific models."}`,
      7,
      'Collection',
      false,
      null,
    ],
    [
      6,
      '2023-07-25 18:13:12.053',
      null,
      -1,
      `{"link": "/articles", "title": "Featured Articles", "linkText": "Explore all articles", "withIcon": true, "collection": {"id": ${rand(
        collectArticle
      )}, "limit": 8}, "description": "Find information, guides and tutorials, analysis on particular topics and much more. From the community, for the community."}`,
      8,
      'Collection',
      false,
      null,
    ],
  ];
};

/**
 * Leaderboard
 */
const genLeaderboards = () => {
  // id, index, title, description, "scoringDescription", query, active, public

  return [
    [
      'overall',
      1,
      'Creators',
      'Top model creators in the community',
      `√((downloads/10) +
(likes * 3) +
(generations/100))
---
Only models without mature cover images are considered
Diminishing returns up to 120 entries`,
      // language=text
      `WITH entries AS (
	SELECT
		m."userId",
		( -- Points
			(mvm."downloadCount" / 10) +
			(mvm."thumbsUpCount" * 3) +
			(mvm."generationCount" / 100)
		) * ( -- Age
		  1 - (1 * (EXTRACT(DAY FROM (now() - mv."publishedAt"))/30)^2)
		) as score,
		mvm."thumbsUpCount",
		mvm."generationCount",
		mvm."downloadCount",
		mv."publishedAt"
	FROM "ModelVersionMetric" mvm
	JOIN "ModelVersion" mv ON mv.id = mvm."modelVersionId"
	JOIN "Model" m ON mv."modelId" = m.id
	WHERE
	  mv."publishedAt" > current_date - INTERVAL '30 days'
	  AND mvm.timeframe = 'Month'
	  AND mv.status = 'Published'
	  AND m.status = 'Published'
	  AND mv.meta->>'imageNsfw' IN ('None', 'Soft')
), entries_ranked AS (
	SELECT
		*,
		row_number() OVER (PARTITION BY "userId" ORDER BY score DESC) rank
	FROM entries
), entries_multiplied AS (
  SELECT
    *,
    GREATEST(0, 1 - (rank/120::double precision)^0.5) as quantity_multiplier
  FROM entries_ranked
), scores AS (
	SELECT
	  "userId",
	  sqrt(SUM(score * quantity_multiplier)) * 1000 score,
	  jsonb_build_object(
	    'thumbsUpCount', SUM("thumbsUpCount"),
	    'generationCount', SUM("generationCount"),
	    'downloadCount', SUM("downloadCount"),
	    'entries', COUNT(*)
		) metrics
	FROM entries_multiplied er
	JOIN "User" u ON u.id = er."userId"
	WHERE u."deletedAt" IS NULL AND u.id > 0
	GROUP BY "userId"
)`,
      true,
      true,
    ],
    [
      'overall_90',
      2,
      'Creators (90 Days)',
      'Top model creators in the community over the last 90 days',
      `√((downloads/10) +
(likes * 3) +
(generations/100))
---
Only models without mature cover images are considered
Diminishing returns up to 120 entries
This leaderboard is experimental and temporary`,
      // language=text
      `WITH entries AS (
	SELECT
		m."userId",
		( -- Points
			(mvm."downloadCount" / 10) +
			(mvm."thumbsUpCount" * 3) +
			(mvm."generationCount" / 100)
		) * ( -- Age
			-0.1 + ((1+0.1)/(1+(EXTRACT(DAY FROM (now() - mv."publishedAt"))/40.03)^2.71))
		) as score,
		EXTRACT(DAY FROM (now() - mv."publishedAt")) as days,
		mvm."thumbsUpCount",
		mvm."generationCount",
		mvm."downloadCount",
		mv."publishedAt"
	FROM "ModelVersionMetric" mvm
	JOIN "ModelVersion" mv ON mv.id = mvm."modelVersionId"
	JOIN "Model" m ON mv."modelId" = m.id
	WHERE
	  mv."publishedAt" BETWEEN current_date - INTERVAL '90 days' AND now()
	  AND mvm.timeframe = 'AllTime'
	  AND mv.status = 'Published'
	  AND m.status = 'Published'
	  AND mv.meta->>'imageNsfw' IN ('None', 'Soft')
), entries_ranked AS (
	SELECT
		*,
		row_number() OVER (PARTITION BY "userId" ORDER BY score DESC) rank
	FROM entries
), entries_multiplied AS (
  SELECT
    *,
    GREATEST(0, 1 - (rank/120::double precision)^0.5) as quantity_multiplier
  FROM entries_ranked
), scores AS (
	SELECT
	  "userId",
	  sqrt(SUM(score * quantity_multiplier)) * 1000 score,
	  jsonb_build_object(
	    'thumbsUpCount', SUM("thumbsUpCount"),
	    'generationCount', SUM("generationCount"),
	    'downloadCount', SUM("downloadCount"),
	    'entries', COUNT(*)
		) metrics
	FROM entries_multiplied er
	JOIN "User" u ON u.id = er."userId"
	WHERE u."deletedAt" IS NULL AND u.id > 0
	GROUP BY "userId"
)`,
      true,
      true,
    ],
    [
      'overall_nsfw',
      3,
      'Creators (mature)',
      'Top model creators in the community',
      `√((downloads/10) +
(likes * 3) +
(generations/100))
---
Diminishing returns up to 120 entries`,
      // language=text
      `WITH entries AS (
	SELECT
		m."userId",
		( -- Points
			(mvm."downloadCount" / 10) +
			(mvm."thumbsUpCount" * 3) +
			(mvm."generationCount" / 100)
		) * ( -- Age
		  1 - (1 * (EXTRACT(DAY FROM (now() - mv."publishedAt"))/30)^2)
		) as score,
		mvm."thumbsUpCount",
		mvm."generationCount",
		mvm."downloadCount",
		mv."publishedAt"
	FROM "ModelVersionMetric" mvm
	JOIN "ModelVersion" mv ON mv.id = mvm."modelVersionId"
	JOIN "Model" m ON mv."modelId" = m.id
	WHERE
	  mv."publishedAt" > current_date - INTERVAL '30 days'
	  AND mvm.timeframe = 'Month'
	  AND mv.status = 'Published'
	  AND m.status = 'Published'
), entries_ranked AS (
	SELECT
		*,
		row_number() OVER (PARTITION BY "userId" ORDER BY score DESC) rank
	FROM entries
), entries_multiplied AS (
  SELECT
    *,
    GREATEST(0, 1 - (rank/120::double precision)^0.5) as quantity_multiplier
  FROM entries_ranked
), scores AS (
	SELECT
	  "userId",
	  sqrt(SUM(score * quantity_multiplier)) * 1000 score,
	  jsonb_build_object(
	    'thumbsUpCount', SUM("thumbsUpCount"),
	    'generationCount', SUM("generationCount"),
	    'downloadCount', SUM("downloadCount"),
	    'entries', COUNT(*)
		) metrics
	FROM entries_multiplied er
	JOIN "User" u ON u.id = er."userId"
	WHERE u."deletedAt" IS NULL AND u.id > 0
	GROUP BY "userId"
)`,
      true,
      true,
    ],
    [
      'new_creators',
      4,
      'New Creators',
      'Top new creators this month',
      `√((downloads/10) +
(likes * 3) +
(generations/100))
---
Only models without mature cover images are considered
Diminishing returns up to 120 entries
First model added in the last 30 days`,
      // language=text
      `WITH entries AS (
	SELECT
		m."userId",
		( -- Points
			(mvm."downloadCount" / 10) +
			(mvm."thumbsUpCount" * 3) +
			(mvm."generationCount" / 100)
		) * ( -- Age
		  1 - (1 * (EXTRACT(DAY FROM (now() - mv."publishedAt"))/30)^2)
		) as score,
		mvm."thumbsUpCount",
		mvm."generationCount",
		mvm."downloadCount",
		mv."publishedAt"
	FROM "ModelVersionMetric" mvm
	JOIN "ModelVersion" mv ON mv.id = mvm."modelVersionId"
	JOIN "Model" m ON mv."modelId" = m.id
	WHERE
	  mv."publishedAt" > current_date - INTERVAL '30 days'
	  AND mvm.timeframe = 'Month'
	  AND mv.status = 'Published'
	  AND m.status = 'Published'
	  AND mv.meta->>'imageNsfw' IN ('None', 'Soft')
		AND NOT EXISTS (
			SELECT 1 FROM "Model" mo
			WHERE
				mo."userId" = m."userId"
				AND mo."publishedAt" < current_date - INTERVAL '31 days'
		)
), entries_ranked AS (
	SELECT
		*,
		row_number() OVER (PARTITION BY "userId" ORDER BY score DESC) rank
	FROM entries
), entries_multiplied AS (
  SELECT
    *,
    GREATEST(0, 1 - (rank/120::double precision)^0.5) as quantity_multiplier
  FROM entries_ranked
), scores AS (
	SELECT
	  "userId",
	  sqrt(SUM(score * quantity_multiplier)) * 1000 score,
	  jsonb_build_object(
	    'thumbsUpCount', SUM("thumbsUpCount"),
	    'generationCount', SUM("generationCount"),
	    'downloadCount', SUM("downloadCount"),
	    'entries', COUNT(*)
		) metrics
	FROM entries_multiplied er
	JOIN "User" u ON u.id = er."userId"
	WHERE u."deletedAt" IS NULL AND u.id > 0
	GROUP BY "userId"
)`,
      true,
      true,
    ],
  ];
};

const genRows = async (truncate = true) => {
  if (truncate) await truncateRows();

  const users = genUsers(numRows, true);
  const userIds = await insertRows('User', users);

  const models = genModels(numRows, userIds);
  const modelIds = await insertRows('Model', models);
  const modelData = models
    .map((m) => ({ id: m[6] as number, userId: m[7] as number, type: m[25] as ModelUploadType }))
    .filter((m) => modelIds.includes(m.id));

  const mvs = genMvs(Math.ceil(numRows * 3), modelData);
  const mvIds = await insertRows('ModelVersion', mvs);
  const mvData = mvs
    .map((mv) => {
      const modelId = mv[7] as number;
      const matchModel = modelData.find((m) => m.id === modelId);
      return {
        id: mv[6] as number,
        modelId: modelId,
        userId: matchModel?.userId,
        type: mv[mv.length - 1] as ModelUploadType,
      };
    })
    .filter((mv) => mvIds.includes(mv.id));

  const mFiles = genMFiles(Math.ceil(numRows * 4), mvData);
  await insertRows('ModelFile', mFiles);

  const reviews = genReviews(Math.ceil(numRows * 5), userIds, mvData);
  const reviewIds = await insertRows('ResourceReview', reviews);

  const posts = genPosts(Math.ceil(numRows * 4), userIds, mvData);
  const postIds = await insertRows('Post', posts);

  const images = genImages(Math.ceil(numRows * 8), userIds, postIds);
  const imageIds = await insertRows('Image', images);

  const articles = genArticles(numRows, userIds, imageIds);
  const articleIds = await insertRows('Article', articles);

  const tools = genTools(10);
  const toolIds = await insertRows('Tool', tools);

  const techniques = genTechniques();
  const techniqueIds = await insertRows('Technique', techniques);

  const collections = genCollections(numRows, userIds, imageIds);
  const collectionIds = await insertRows('Collection', collections);
  const collectionData = collections
    .map((c) => ({
      id: c[0] as number,
      type: c[8] as CollectionType,
    }))
    .filter((c) => collectionIds.includes(c.id));

  const collectionItems = genCollectionItems(
    Math.ceil(numRows * 2),
    collectionData,
    articleIds,
    postIds,
    imageIds,
    modelIds,
    userIds
  );
  await insertRows('CollectionItem', collectionItems);

  const imageTools = genImageTools(numRows, imageIds, toolIds);
  await insertRows('ImageTool', imageTools);

  const imageTechniques = genImageTechniques(numRows, imageIds, techniqueIds);
  await insertRows('ImageTechnique', imageTechniques);

  const tags = genTags(numRows);
  const tagIds = await insertRows('Tag', tags);

  const tagsOnArticles = genTagsOnArticles(Math.ceil(numRows * 3), tagIds, articleIds);
  await insertRows('TagsOnArticle', tagsOnArticles);

  const tagsOnPosts = genTagsOnPosts(Math.ceil(numRows * 3), tagIds, postIds);
  await insertRows('TagsOnPost', tagsOnPosts);

  const tagsOnImages = genTagsOnImages(Math.ceil(numRows * 3), tagIds, imageIds);
  await insertRows('TagsOnImage', tagsOnImages);

  const tagsOnModels = genTagsOnModels(Math.ceil(numRows * 3), tagIds, modelIds);
  await insertRows('TagsOnModels', tagsOnModels);

  // TODO TagsOnImageVote
  // TODO TagsOnModelsVote

  const commentsV1 = genCommentsModel(Math.ceil(numRows * 3), userIds, modelIds, [], false);
  const commentsV1Ids = await insertRows('Comment', commentsV1);

  const commentsV1Thread = genCommentsModel(
    numRows,
    userIds,
    modelIds,
    commentsV1Ids,
    true,
    commentsV1Ids[commentsV1Ids.length - 1]
  );
  const commentsV1AllIds = await insertRows('Comment', commentsV1Thread);

  const threads = genThreads(
    Math.ceil(numRows * 3),
    imageIds,
    postIds,
    reviewIds,
    articleIds,
    [],
    [],
    false
  );
  const threadIds = await insertRows('Thread', threads);

  const commentsV2 = genCommentsV2(Math.ceil(numRows * 4), userIds, threadIds);
  const commentsV2Ids = await insertRows('CommentV2', commentsV2);

  const threadsNest = genThreads(
    numRows,
    [],
    [],
    [],
    [],
    commentsV2Ids,
    commentsV2.map((c) => c[7] as number),
    true,
    threadIds[threadIds.length - 1]
  );
  const threadsNestIds = await insertRows('Thread', threadsNest);

  const commentsV2Nest = genCommentsV2(
    numRows,
    userIds,
    threadsNestIds,
    commentsV2Ids[commentsV2Ids.length - 1]
  );
  const commentsV2NestIds = await insertRows('CommentV2', commentsV2Nest);

  const commentsV2AllIds = commentsV2Ids.concat(commentsV2NestIds);

  const resources = genImageResources(numRows, mvIds, imageIds);
  await insertRows('ImageResource', resources);

  const articleEngage = genArticleEngagements(numRows, userIds, articleIds);
  await insertRows('ArticleEngagement', articleEngage);
  const imageEngage = genImageEngagements(numRows, userIds, imageIds);
  await insertRows('ImageEngagement', imageEngage);
  const modelEngage = genModelEngagements(numRows, userIds, modelIds);
  await insertRows('ModelEngagement', modelEngage);
  const mvEngage = genModelVersionEngagements(numRows, userIds, mvIds);
  await insertRows('ModelVersionEngagement', mvEngage);
  const tagEngage = genTagEngagements(numRows, userIds, tagIds);
  await insertRows('TagEngagement', tagEngage);
  const userEngage = genUserEngagements(numRows, userIds, userIds);
  await insertRows('UserEngagement', userEngage);

  const articleReactions = genArticleReactions(Math.ceil(numRows * 5), userIds, articleIds);
  await insertRows('ArticleReaction', articleReactions);
  const commentV1Reactions = genCommentReactions(Math.ceil(numRows * 5), userIds, commentsV1AllIds);
  await insertRows('CommentReaction', commentV1Reactions);
  const commentV2Reactions = genCommentV2Reactions(
    Math.ceil(numRows * 5),
    userIds,
    commentsV2AllIds
  );
  await insertRows('CommentV2Reaction', commentV2Reactions);
  const imageReactions = genImageReactions(Math.ceil(numRows * 5), userIds, imageIds);
  await insertRows('ImageReaction', imageReactions);
  const postReactions = genPostReactions(Math.ceil(numRows * 5), userIds, postIds);
  await insertRows('PostReaction', postReactions);

  const leaderboards = genLeaderboards();
  await insertRows('Leaderboard', leaderboards);

  const homeblocks = genHomeBlocks(collectionData);
  await insertRows('HomeBlock', homeblocks);

  /*
  Account
  Announcement
  ❌ Answer
    ❌ AnswerMetric
    ❌ AnswerReaction
    ❌ AnswerVote
  ApiKey
  ✔️ Article
    ✔️ ArticleEngagement
    ❌ ArticleMetric
    ❌ ArticleRank
    ✔️ ArticleReaction
    ArticleReport
  BlockedImage
  Bounty
    BountyBenefactor
    BountyEngagement
    BountyEntry
    ❌ BountyEntryMetric
    ❌ BountyEntryRank
    BountyEntryReaction
    BountyEntryReport
    ❌ BountyMetric
    ❌ BountyRank
    BountyReport
  BuildGuide
  BuzzClaim
  BuzzTip
  BuzzWithdrawalRequest
  BuzzWithdrawalRequestHistory
  ❌ Chat
    ❌ ChatMember
    ❌ ChatMessage
    ❌ ChatReport
  ❌ Club
    ❌ ClubAdmin
    ❌ ClubAdminInvite
    ❌ ClubMembership
    ❌ ClubMembershipCharge
    ❌ ClubMetric
    ❌ ClubPost
    ❌ ClubPostMetric
    ❌ ClubPostReaction
    ❌ ClubRank
    ❌ ClubTier
  ✔️ Collection
    CollectionContributor
    ✔️ CollectionItem
    ❌ CollectionMetric
    ❌ CollectionRank
    CollectionReport
  ✔️ Comment
    ✔️ CommentReaction
    CommentReport
  ✔️ CommentV2
    ✔️ CommentV2Reaction
    CommentV2Report
  Cosmetic
    CosmeticShopItem
    CosmeticShopSection
    CosmeticShopSectionItem
  CoveredCheckpoint
  CsamReport
  CustomerSubscription
  Donation
    DonationGoal
  DownloadHistory
  EntityAccess
  EntityCollaborator
  ❌ EntityMetric
  File
  GenerationServiceProvider
  ✔️ HomeBlock
  ✔️ Image
    ImageConnection
    ✔️ ImageEngagement
    ImageFlag
    ❌ ImageMetric
    ❌ ImageRank
    ImageRatingRequest
    ✔️ ImageReaction
    ImageReport
    ✔️ ImageResource
    ✔️ ImageTechnique
    ✔️ ImageTool
    ImagesOnModels
  Import
  JobQueue
  KeyValue
  ✔️ Leaderboard
  LeaderboardResult
  LegendsBoardResult
  License
  Link
  Log
  MetricUpdateQueue
  ModActivity
  ✔️ Model
    ModelAssociations
    ✔️ ModelEngagement
  ✔️ ModelFile
    ModelFileHash
    ModelFlag
  ModelInterest
  ❌ ModelMetric
  ❌ ModelMetricDaily
  ❌ ModelRank_New
  ModelReport
  ✔️ ModelVersion
    ✔️ ModelVersionEngagement
    ModelVersionExploration
    ❌ ModelVersionMetric
    ModelVersionMonetization
    ❌ ModelVersionRank
    ModelVersionSponsorshipSettings
  OauthClient
  OauthToken
  Partner
  ✔️ Post
    ❌ PostMetric
    ❌ PostRank
    ✔️ PostReaction
    PostReport
  PressMention
  Price
  Product
  PurchasableReward
  Purchase
  QueryDurationLog
  QueryParamsLog
  QuerySqlLog
  ❌ Question
    ❌ QuestionMetric
    ❌ QuestionReaction
  RecommendedResource
  RedeemableCode
  Report
  ✔️ ResourceReview
    ❌ ResourceReviewReaction
  ResourceReviewReport
  RunStrategy
  SavedModel
  SearchIndexUpdateQueue
  Session
  SessionInvalidation
  ✔️ Tag
    ✔️ TagEngagement
    ❌ TagMetric
    ❌ TagRank
    ✔️ TagsOnArticle
    TagsOnBounty
    TagsOnCollection
    ✔️ TagsOnImage
    TagsOnImageVote
    ✔️ TagsOnModels
    TagsOnModelsVote
    ✔️ TagsOnPost
    ❌ TagsOnPostVote
    ❌ TagsOnQuestions
    TagsOnTags
  ✔️ Technique
  ✔️ Thread
  TipConnection
  ✔️ Tool
  ✔️ User
    UserCosmetic
    UserCosmeticShopPurchases
    ✔️ UserEngagement
    UserLink
    ❌ UserMetric
    UserNotificationSettings
    UserPaymentConfiguration
    UserProfile
    UserPurchasedRewards
    ❌ UserRank
    UserReferral
    UserReferralCode
    UserReport
  Vault
    VaultItem
  VerificationToken
  Webhook
  _LicenseToModel
   */
};

/**
 * Notification
 */
const genNotifications = (num: number) => {
  const ret = [];

  const types = Object.keys(notificationProcessors);

  for (let step = 1; step <= num; step++) {
    const row = [
      step, // id
      rand(types), // type
      faker.string.uuid(), // key // TODO this isn't right, but it works
      rand(Object.values(NotificationCategory)), // category
      '{}', // details // TODO
    ];

    ret.push(row);
  }
  return ret;
};

/**
 * UserNotification
 */
const genUserNotifications = (num: number, notifIds: number[], userIds: number[]) => {
  const ret = [];

  for (let step = 1; step <= num; step++) {
    const row = [
      step, // id
      rand(notifIds), // notificationId
      rand(userIds), // userId
      fbool(), // viewed
      faker.date.past({ years: 3 }).toISOString(), // createdAt
    ];

    ret.push(row);
  }
  return ret;
};

const genNotificationRows = async (truncate = true) => {
  if (truncate) await truncateNotificationRows();

  const userData = await pgDbWrite.query<{ id: number }>(`SELECT id from "User"`);
  const userIds = userData.rows.map((u) => u.id);

  const notifs = genNotifications(numRows);
  const notifIds = await insertNotifRows('Notification', notifs);

  const userNotifs = genUserNotifications(numRows * 3, notifIds, userIds);
  await insertNotifRows('UserNotification', userNotifs);
};

const genRedisSystemFeatures = async () => {
  const keys = [[REDIS_KEYS.SYSTEM.FEATURES, REDIS_KEYS.TRAINING.STATUS]];

  for (const keySet of keys) {
    const [baseKey, subKey] = keySet;
    await redis.hSet(baseKey, subKey, JSON.stringify({}));
  }
};

const appliedMigrations = [
  '20221011220133_init',
  '20221013171533_add_nsfw',
  '20221013194408_int_keys',
  '20221013203441_cascades',
  '20221013221254_no_optional_user_id',
  '20221013224243_numeric_image_dimensions',
  '20221014182803_metrics_and_saves',
  '20221014212220_add_image_index',
  '20221018202627_add_kv_store',
  '20221018213100_split_model_metrics',
  '20221018215322_optional_model_desc',
  '20221019000757_model_ranks',
  '20221019192339_remove_images_from_model',
  '20221020230242_rating_to_float',
  '20221025225635_user_account_props',
  '20221027230516_username_unique_case_insensitive',
  '20221031222816_image_cascade_on_delete',
  '20221101202142_anonymous_user_activities',
  '20221101230538_add_training_data_download_tracking',
  '20221103193819_add_tos_violation',
  '20221103200953_model_review_reporting',
  '20221103205440_add_moderator',
  '20221103221020_user_tos',
  '20221108145701_cascade_delete_version_metrics_reviews',
  '20221108160217_update_sizekb_tyoe_int_to_float',
  '20221108215007_rank_fix',
  '20221109183328_rank_fix_2',
  '20221109192749_rank_fix_3',
  '20221110180604_trained_words_on_version',
  '20221110222142_temp_verified_model',
  '20221111185845_model_files',
  '20221112015716_scan_request_time',
  '20221112190714_handle_bad_uploads',
  '20221114043025_add_importing',
  '20221114213528_image_meta',
  '20221115210524_add_uniqueness_to_reactions',
  '20221116143356_import_children',
  '20221118203334_add_apikey_table',
  '20221128223635_add_favorite_model_table',
  '20221129184259_favorite_model_metric',
  '20221129201529_update_rank_for_favorites',
  '20221202170057_model_file_format',
  '20221202191101_model_version_index',
  '20221202204857_add_comment_tables',
  '20221202220635_user_link',
  '20221202230223_user_link_index',
  '20221202230448_user_rank',
  '20221203005905_remove_user_link_index',
  '20221205213338_comment_table_update',
  '20221205232721_user_created_date',
  '20221207040459_add_logging',
  '20221207202442_support_inaccurate_report',
  '20221207235134_add_notification_table',
  '20221208022641_run_v1',
  '20221208032821_comment_metrics',
  '20221209162539_add_person_of_interest_toggle',
  '20221209174938_add_unique_constraint_user_notifications',
  '20221209190209_partner_tokens',
  '20221209210146_update_model_file_type',
  '20221212033336_add_model_hash',
  '20221212045320_model_hash_report_support',
  '20221213232706_add_lora',
  '20221214181035_add_modelfile_id',
  '20221214181207_add_model_file_unique',
  '20221215050908_add_webhooks',
  '20221215052358_published_at',
  '20221216163900_last_version_at',
  '20221216173428_report',
  '20221216191451_additional_report_reasons',
  '20221216195329_add_user_engagement',
  '20221216211622_model_report_count',
  '20221219234321_report_manys',
  '20221220044202_add_trending',
  '20221220204300_ranks_as_materialized_views',
  '20221220211549_current_mviews',
  '20221221002209_add_base_model',
  '20221222223841_file_types_as_string',
  '20221223175226_model_type_default',
  '20221223180254_add_tag_target',
  '20221223182642_tag_unique_with_target',
  '20221226174634_question_answers',
  '20221226195245_optional_answer_vote_vote',
  '20221226201249_add_download_history',
  '20221228193154_report_cascading',
  '20221230223422_hash_on_files',
  '20221230234742_review_exclusion',
  '20221231002954_prep_on_demand_partners',
  '20221231224306_break_out_user_rank',
  '20230103185824_display_name',
  '20230105043946_run_strategy_cascades',
  '20230105174251_add_user_preferred_download',
  '20230105180003_revise_rating_rank',
  '20230105194139_remove_model_file_primary_field',
  '20230106181738_defined_commercial_uses',
  '20230106210644_mark_images_nsfw',
  '20230106223259_leaderboard_rank',
  '20230110213544_add_tag_engagment',
  '20230110235012_image_analysis',
  '20230111032437_model_licenses',
  '20230111224629_cascade_model_hash',
  '20230112001351_unique_image_constraint',
  '20230112193222_tag_metrics',
  '20230112234519_unlistable_tags',
  '20230113232730_user_answer_stats',
  '20230117162526_model_engagement',
  '20230117190149_fix_user_cascades',
  '20230118020152_remove_favorites',
  '20230118154709_add_model_early_access_timeframe',
  '20230118195800_add_model_version_early_access_timeframe',
  '20230119185541_add_model_version_engagement',
  '20230120050134_adjust_scanning_enums',
  '20230124192503_soft_delete_model',
  '20230124204854_add_deleted_model_status',
  '20230125214723_model_checkpoint_type',
  '20230125230024_session_invalidation',
  '20230126222352_image_first_class',
  '20230127004457_image_metrics',
  '20230127171929_image_comment_metrics',
  '20230127232300_metric_update_queue',
  '20230130192853_on_demand_types',
  '20230130211031_announcements',
  '20230130224954_comment_lock',
  '20230130231226_adjust_review_cascades',
  '20230131150221_review_lock',
  '20230201143158_mute_users',
  '20230201205224_ban_user',
  '20230202153952_user_cosmetics',
  '20230203224140_stripe',
  '20230207225516_cosmetic_delivery',
  '20230207230114_cosmetic_default_id_fix',
  '20230208211232_report_internal_message',
  '20230209171946_add_model_locked',
  '20230209203015_report_limiting',
  '20230209225221_rename_inaction_unaction',
  '20230210200501_add_iscategory_tag',
  '20230210222835_model_hash_view',
  '20230211012925_subscription_update_date',
  '20230212204953_api_key_tweaks',
  '20230213223732_update_model_new_rank',
  '20230214004943_comment_threads',
  '20230214144643_multiple_tag_target',
  '20230216003413_image_gen_process',
  '20230216033353_image_feature_at',
  '20230217033101_unfeatured_categories',
  '20230217213122_image_needs_review',
  '20230217220241_tag_unique_name',
  '20230220220914_user_activity_index',
  '20230221151809_view_pef_tweaks',
  '20230221230819_user_setting_autoplay_gifs',
  '20230223225028_add_new_types',
  '20230227220233_prep_for_mod_tags',
  '20230303201656_leaderboard_exclude_deleted',
  '20230305040226_account_metadata',
  '20230306181918_model_delete_tracking',
  '20230306211459_model_hash_file_type',
  '20230308010444_posts',
  '20230308161211_post_helper',
  '20230309201953_enhanced_moderation',
  '20230309235349_model_files_preferences',
  '20230310005918_image_size',
  '20230311174603_locon',
  '20230312182841_wildcards',
  '20230313221818_commentv2_reporting',
  '20230315025401_other_type',
  '20230315182114_posts_continued',
  '20230316201031_resource_helpers',
  '20230317181458_user_tagging',
  '20230321212209_optimizations',
  '20230321232309_post_tags',
  '20230322230044_discussion_items',
  '20230323084001_tags_on_tags',
  '20230330165149_top_level_comment_thread',
  '20230405222519_model_status_unpublished_violation',
  '20230407001434_model_version_published_at',
  '20230410221344_resource_review_reports',
  '20230411234137_model_early_access_deadline',
  '20230414200229_model_modifier',
  '20230418020950_model_metrics_daily',
  '20230425180849_nsfw_levels',
  '20230425215834_tag_nsfw_level',
  '20230428002410_mat_views_to_tables',
  '20230511223534_articles',
  '20230511230904_associated_resources',
  '20230515231112_admin_tags',
  '20230517192001_article_attachments',
  '20230517201204_article_engagement',
  '20230517204144_article_metrics',
  '20230518224652_leaderboard_v2',
  '20230522192516_model_type_vae_upscaler',
  '20230522223742_mod_activity',
  '20230605211505_post_report',
  '20230607213943_model_version_exploration',
  '20230608213212_report_user',
  '20230609155557_user_leaderboard_showcase',
  '20230613205927_model_article_association',
  '20230616212538_model_association_nullable',
  '20230619185959_cascade_delete_associations',
  '20230619222230_scheduled_publish',
  '20230620163537_hidden_comments',
  '20230620203240_image_ingestion_status',
  '20230622200840_image_moderation_level',
  '20230622213253_image_engagement',
  '20230623160539_generation_coverage_1',
  '20230626231430_not_null_base_model',
  '20230630171915_model_version_clip_skip',
  '20230704185357_create_search_index_update_queue_table',
  '20230706162241_add_search_index_update_queue_action',
  '20230706163005_add_search_index_update_queue_action_enum',
  '20230712182936_create_collection_related_models',
  '20230712191329_fix_ids_on_collection_tables',
  '20230712203205_add_home_block_type',
  '20230712204937_unlisted_read_config',
  '20230714202551_recommended_vae',
  '20230717203328_add_metadata_to_announcements',
  '20230718193348_add_collection_type',
  '20230719152210_setup_for_collection_review_items',
  '20230719182634_add_collection_write_configuration_review',
  '20230721184738_post_collection_relation',
  '20230726205546_drop_reviews',
  '20230727150451_add_source_to_home_blocks',
  '20230727165302_collection_image',
  '20230728063536_collection_model_metrics',
  '20230728170432_image_type',
  '20230809032747_model_purpose',
  '20230809234333_generation_coverage',
  '20230811054020_nsfw_level_blocked',
  '20230811173920_download_history',
  '20230813154457_adding_training_data',
  '20230818173920_add_workflows',
  '20230824160203_collection_metrics',
  '20230828183133_image_post_collected_count_metrics',
  '20230829142201_add_model_version_monetization_table',
  '20230901221543_rent_civit',
  '20230902054355_paid_generation_option',
  '20230904155529_add_bounty_schema',
  '20230904212207_update_generation_coverage_view',
  '20230904215223_generation_covergae_view_rentcivit',
  '20230906215932_tag_source',
  '20230908201330_computed_tag_source',
  '20230912004157_motion_module',
  '20230912153043_add_bounty_complete',
  '20230912205241_add_bounty_metrics',
  '20230912220022_add_bounty_rank_views',
  '20230913054542_social_homeblock',
  '20230913162225_add_bounty_metric_comment_count',
  '20230914165121_bounty_report',
  '20230914200233_bounty_poi',
  '20230918202805_add_user_referrals',
  '20230918222033_make_user_referral_code_unqye',
  '20230920153125_crate_buzz_tip_table',
  '20230920200843_update_bounty_indexes',
  '20230920211650_add_deleted_at_user_referral_code',
  '20230921142409_add_user_id_index_user_referrals',
  '20230921160043_add_created_updated_at_buzz_tip',
  '20230921161619_add_tipped_amount_on_articles',
  '20230921204323_bounty_entry_description',
  '20230925155218_add_buzz_tip_on_bounty_entry',
  '20230927151024_collection_mode_support',
  '20230928151649_collection_item_random_id',
  '20230928163847_add_datapurged_to_modelfile',
  '20230929145153_collection_item_collection_id_index',
  '20231005123051_bounty_expires_at_starts_at_date_only',
  '20231006205635_comment_v2_hidden',
  '20231013203903_user_onboarding_step',
  '20231019210147_model_version_monetization_buzz_currency',
  '20231024143326_user_referral_code_crated_at',
  '20231025204142_image_scan_job',
  '20231026192053_add_user_profile_schema',
  '20231027024129_require_auth_option',
  '20231027035952_run_partner_base_model',
  '20231027221218_image_view_count',
  '20231031195932_update_user_profile_schema',
  '20231103152012_recommended_resources',
  '20231109061817_model_file_header_data',
  '20231110192419_add_landing_page_to_user_referral',
  '20231110203035_add_login_redirect_reason_to_user_referral',
  '20231110210854_claimable_cosmetics',
  '20231115072331_press_mention',
  '20231118201935_collection_item_reviewed_by',
  '20231121050854_holiday_cosmetics',
  '20231122151806_add_club_related_tables',
  '20231123201130_update_club_entity_table',
  '20231127231440_remove_club_entity_improve_entity_access',
  '20231128212202_add_club_post_cover_image',
  '20231130141155_add_club_membershi_id',
  '20231130143354_remove_buzz_account_id',
  '20231201094437_event_homeblock_type',
  '20231203043804_generation_metrics',
  '20231207201510_add_club_post_thread',
  '20231207204618_user_profile_picture',
  '20231213152614_model_gallery_settings',
  '20231213153118_add_club_admin_support',
  '20231213153829_add_club_tier_member_limit',
  '20231213182603_csam_report',
  '20231218152300_add_unlisted_availability_to_post_entity_id_club_post',
  '20231222015820_notification_split',
  '20231222180336_optional_club_post_title_description',
  '20231223004700_report_type_csam',
  '20240102150617_add_club_post_reactions',
  '20240102154255_add_club_post_metrics',
  '20240102183528_add_club_metrics',
  '20240102211435_add_club_ranks',
  '20240105204334_add_one_time_fee_on_club_tier',
  '20240110183909_add_dm_tables',
  '20240110202344_dm_user_relationship',
  '20240111143445_dm_chat_owner',
  '20240111144730_dm_chat_edited_optional',
  '20240112151626_user_settings',
  '20240113023932_email_citext',
  '20240114174922_add_parent_thread_id_root_thread_id_on_threads',
  '20240117150305_add_ignored_to_chat_enum',
  '20240118213143_tags_on_tags_type',
  '20240118214315_muted_at',
  '20240119175458_buzz_claim',
  '20240119204734_muted_at_trigger',
  '20240121232802_buzz_claim_details',
  '20240123173456_article_cover_id',
  '20240125153716_add_user_stripe_connect_status',
  '20240125182002_add_unique_on_conected_account_id',
  '20240126153602_add_chat_report',
  '20240129152539_add_buzz_withdrawal_requeests_tables',
  '20240129203835_add_model_availability',
  '20240206222015_nsfw_level_2',
  '20240207190207_notification_category',
  '20240207200350_tags_on_image_vote_applied',
  '20240208212306_user_updates',
  '20240209213025_build_guide',
  '20240212151513_add_buzz_withdrawal_status_externally_resolved',
  '20240213195536_additional_notification_categories',
  '20240213205914_nsfw_levels',
  '20240217005100_partner_tier',
  '20240219150315_collection_data_structure_improvements',
  '20240220184546_partner_logo',
  '20240220204643_resource_review_recommended_system',
  '20240221203954_model_commercial_user_array',
  '20240221204751_add_purchasable_rewards_schema',
  '20240227203510_add_vault_schema',
  '20240229155733_vault_item_update_field',
  '20240305191909_vault_item_improvement_schema_changes',
  '20240307231126_nsfw_level_update_queue',
  '20240308194924_vault_item_meta_field',
  '20240312143533_vault_item_files_as_json',
  '20240312210710_vault_item_indexes',
  '20240313071941_metric_updated_at',
  '20240321152907_image_resource_strength',
  '20240325234311_image_rating_request',
  '20240326201017_cosmetic_shop_tables',
  '20240327194537_redeemable_code',
  '20240329072855_add_dora',
  '20240403142806_add_cosmetic_type_profile_decoration',
  '20240405133543_dms_add_more_content_type',
  '20240409152606_add_cosmetic_reference_to_item',
  '20240409202625_add_shop_item_unit_amount',
  '20240411155123_make_image_optional',
  '20240411185822_add_cosmetic_type_profile_background',
  '20240418202619_add_for_id_user_cosmetic',
  '20240419174913_image_tools',
  '20240423150723_add_user_public_settings',
  '20240430033247_user_metric_reactions',
  '20240504220623_file_override_name',
  '20240508215105_image_techniques',
  '20240509145855_add_domain_to_tool',
  '20240516171837_add_editor_to_tooltype',
  '20240520214941_early_access_v2',
  '20240524211244_add_training_statuses',
  '20240528185514_early_access_v2_nits',
  '20240528212836_muted_confirmed',
  '20240528220022_exclude_from_leaderboards',
  '20240603200922_tool_priority',
  '20240604172025_api_key_type',
  '20240606185927_tool_description',
  '20240610185726_add_minor_field',
  '20240613183520_csam_report_type',
  '20240613215736_collection_item_tag_id',
  '20240617215459_entity_collaborator',
  '20240619092115_reward_eligibility',
  '20240619152041_entity_collaborator_last_message_sent_at',
  '20240619181506_add_video_url',
  '20240619185235_add_video_url_to_cosmetic_shop_item',
  '20240620155119_user_engagement_type_block',
  '20240620165739_rollback_add_video_url_cosmetic_shop_item',
  '20240624134110_tool_metadata',
  '20240719172747_add_published_to_image_and_trigger',
  '20240724182718_add_entity_metrics',
  '20240725040405_simplify_run_strat',
  '20240729233040_image_block',
  '20240808220734_ad_token_table',
  '20240809155038_add_paddle_customer_id',
  '20240809230424_tag_source_image_hash',
  '20240812183927_hamming_distance_function',
  '20240815210353_add_payment_providers',
  '20240830173458_add_upload_type_to_mv',
  '20240911095200_query_improvements',
  '20240915215614_image_flag',
  '20240926213438_model_scanned_at_column',
  '20240930191432_add_cosmetic_shop_home_block_type',
  '20240930192521_model_flag_details_column',
  '20241003192438_model_flag_poi_name_column',
];

const getHashForMigration = async (folder: string) => {
  const hash = createHash('sha256');
  const content = await fs.readFile(`./prisma/migrations/${folder}/migration.sql`, 'utf-8');
  hash.update(content);
  return hash.digest('hex');
};

export const insertNewMigrations = async (migrations: string[]) => {
  const now = new Date();
  const migrationData: (string | number | null | Date)[][] = [];
  for (const m of migrations) {
    const hash = await getHashForMigration(m);
    migrationData.push([faker.string.uuid(), hash, now, m, null, null, now, 0]);
  }
  await insertRows('_prisma_migrations', migrationData);
};

const main = async () => {
  await pgDbWrite.query('REASSIGN OWNED BY doadmin, civitai, "civitai-jobs" TO postgres');
  await pgDbWrite.query(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "postgres"'
  );
  await pgDbWrite.query('GRANT ALL ON ALL TABLES IN schema public TO "postgres"');
  await genRows();
  await pgDbWrite.query('REFRESH MATERIALIZED VIEW "CoveredCheckpointDetails"');

  await genNotificationRows();

  await genRedisSystemFeatures();

  await insertNewMigrations(appliedMigrations);
};

if (require.main === module) {
  main().then(() => {
    // pgDbRead.end();
    process.exit(0);
  });
}
