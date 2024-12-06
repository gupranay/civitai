import { Alert, Button, Loader, Modal, Text, Textarea } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { useState } from 'react';
import { BuzzTransactionButton } from '~/components/Buzz/BuzzTransactionButton';
import { useDialogContext } from '~/components/Dialog/DialogProvider';
import { createEntityAppealSchema } from '~/server/schema/report.schema';
import { EntityType } from '~/shared/utils/prisma/enums';
import { showErrorNotification } from '~/utils/notifications';
import { trpc } from '~/utils/trpc';

const MAX_MESSAGE_LENGTH = 220;

export function AppealDialog({ entityId, entityType }: Props) {
  const dialog = useDialogContext();
  const [state, setState] = useState<State>({ message: '', error: '' });

  const { data = 0, isLoading } = trpc.report.getRecentAppeals.useQuery({});

  const createAppealMutation = trpc.report.createAppeal.useMutation({
    onSuccess: () => {
      handleClose();
    },
    onError: (error) => {
      showErrorNotification({
        title: 'Unable to create appeal',
        error: new Error(error.message),
      });
    },
  });

  const handleSubmit = () => {
    const result = createEntityAppealSchema.safeParse({
      entityId,
      entityType,
      message: state.message,
    });
    if (!result.success) {
      setState({
        ...state,
        error: result.error.flatten().fieldErrors.message?.[0] ?? 'Message is required',
      });
      return;
    }

    createAppealMutation.mutate({ entityId, entityType, message: state.message });
  };

  const handleClose = () => {
    setState({ message: '', error: '' });
    dialog.onClose();
  };

  useHotkeys([['mod+Enter', handleSubmit]]);
  const shouldChargeBuzz = data >= 3;

  return (
    <Modal
      {...dialog}
      title={<Text className="font-semibold">Appeal Removal</Text>}
      size="lg"
      onClose={handleClose}
      centered
    >
      {isLoading ? (
        <div className="flex items-center justify-center p-5">
          <Loader />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Textarea
            label="Message"
            description={`${state.message.length}/${MAX_MESSAGE_LENGTH} characters`}
            placeholder="Please provide a reason for appealing the removal of this content"
            value={state.message}
            onChange={(e) => setState({ message: e.currentTarget.value, error: '' })}
            error={state.error}
            minRows={3}
            maxRows={5}
            maxLength={MAX_MESSAGE_LENGTH}
            autosize
            required
          />
          {shouldChargeBuzz && (
            <Alert color="yellow">
              <Text size="xs">
                Since you have already made an above average number of appeals that have been
                declined, this and additional appeals will carry a Buzz fee that will be returned to
                you upon acceptance of your appeal. This fee will also be removed 30 days after your
                last declined appeal.
              </Text>
            </Alert>
          )}
          <div className="flex justify-end gap-4">
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            {shouldChargeBuzz ? (
              <BuzzTransactionButton
                buzzAmount={100}
                label="Submit"
                transactionType="Default"
                loading={createAppealMutation.isLoading}
                onPerformTransaction={handleSubmit}
                showPurchaseModal
              />
            ) : (
              <Button onClick={handleSubmit} loading={createAppealMutation.isLoading}>
                Submit
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

type State = { message: string; error: string };
type Props = { entityId: number; entityType: EntityType };
