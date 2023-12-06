import { trpc } from '~/utils/trpc';
import { showErrorNotification, showSuccessNotification } from '~/utils/notifications';
import {
  GetInfiniteClubPostsSchema,
  GetInfiniteClubSchema,
  GetPaginatedClubResourcesSchema,
  getPaginatedClubResourcesSchema,
  RemoveClubResourceInput,
  SupportedClubEntities,
  UpdateClubResourceInput,
  UpsertClubInput,
  UpsertClubPostInput,
  UpsertClubResourceInput,
  UpsertClubTierInput,
} from '~/server/schema/club.schema';
import { GetInfiniteBountySchema } from '~/server/schema/bounty.schema';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { useHiddenPreferencesContext } from '~/providers/HiddenPreferencesProvider';
import { useMemo } from 'react';
import {
  applyUserPreferencesClub,
  applyUserPreferencesClubPost,
} from '~/components/Search/search.utils';
import { ClubGetAll, ClubPostGetAll, UserClub } from '~/types/router';
import {
  CreateClubMembershipInput,
  GetInfiniteClubMembershipsSchema,
  OwnerRemoveClubMembershipInput,
  UpdateClubMembershipInput,
} from '~/server/schema/clubMembership.schema';
import { useFiltersContext } from '~/providers/FiltersProvider';
import { removeEmpty } from '~/utils/object-helpers';
import { removeAndRefundMemberHandler } from '~/server/controllers/clubMembership.controller';

export const useQueryClub = ({ id }: { id: number }) => {
  const { data: club, isLoading: loading } = trpc.club.getById.useQuery({ id });
  return { club, loading };
};

export const useMutateClub = () => {
  const queryUtils = trpc.useContext();

  const upsertClubMutation = trpc.club.upsert.useMutation({
    async onSuccess(result, payload) {
      if (payload.id) await queryUtils.club.getById.invalidate({ id: payload.id });
    },
    onError(error) {
      try {
        // If failed in the FE - TRPC error is a JSON string that contains an array of errors.
        const parsedError = JSON.parse(error.message);
        showErrorNotification({
          title: 'Failed to save club',
          error: parsedError,
        });
      } catch (e) {
        // Report old error as is:
        showErrorNotification({
          title: 'Failed to save club',
          error: new Error(error.message),
        });
      }
    },
  });

  const upsertClubTierMutation = trpc.club.upsertTier.useMutation({
    async onSuccess() {
      await queryUtils.club.getTiers.invalidate();
    },
    onError(error) {
      try {
        // If failed in the FE - TRPC error is a JSON string that contains an array of errors.
        const parsedError = JSON.parse(error.message);
        showErrorNotification({
          title: 'Failed to save club tier',
          error: parsedError,
        });
      } catch (e) {
        // Report old error as is:
        showErrorNotification({
          title: 'Failed to save club tier',
          error: new Error(error.message),
        });
      }
    },
  });

  const upsertClubResourceMutation = trpc.club.upsertResource.useMutation({
    async onSuccess() {
      await queryUtils.club.resourceDetails.invalidate();
    },
    onError(error) {
      try {
        // If failed in the FE - TRPC error is a JSON string that contains an array of errors.
        const parsedError = JSON.parse(error.message);
        showErrorNotification({
          title: 'Failed to save resource changes',
          error: parsedError,
        });
      } catch (e) {
        // Report old error as is:
        showErrorNotification({
          title: 'Failed to save resource changes',
          error: new Error(error.message),
        });
      }
    },
  });

  const upsertClubPostMutation = trpc.clubPost.upsertClubPost.useMutation({
    async onSuccess(_, payload) {
      if (payload.id) {
        await queryUtils.clubPost.getById.invalidate({ id: payload.id });
      }
      await queryUtils.clubPost.getInfiniteClubPosts.invalidate();
    },
    onError(error) {
      try {
        // If failed in the FE - TRPC error is a JSON string that contains an array of errors.
        const parsedError = JSON.parse(error.message);
        showErrorNotification({
          title: 'Failed to save post changes',
          error: parsedError,
        });
      } catch (e) {
        // Report old error as is:
        showErrorNotification({
          title: 'Failed to save post changes',
          error: new Error(error.message),
        });
      }
    },
  });

  const createClubMembershipMutation = trpc.clubMembership.createClubMembership.useMutation({
    async onSuccess() {
      await queryUtils.clubMembership.getClubMembershipOnClub.invalidate();
      await queryUtils.club.userContributingClubs.invalidate();
    },
    onError(error) {
      try {
        // If failed in the FE - TRPC error is a JSON string that contains an array of errors.
        const parsedError = JSON.parse(error.message);
        showErrorNotification({
          title: 'Failed to join club',
          error: parsedError,
        });
      } catch (e) {
        // Report old error as is:
        showErrorNotification({
          title: 'Failed to join club',
          error: new Error(error.message),
        });
      }
    },
  });

  const updateClubMembershipMutation = trpc.clubMembership.updateClubMembership.useMutation({
    async onSuccess() {
      await queryUtils.clubMembership.getClubMembershipOnClub.invalidate();
      await queryUtils.club.userContributingClubs.invalidate();
    },
    onError(error) {
      try {
        // If failed in the FE - TRPC error is a JSON string that contains an array of errors.
        const parsedError = JSON.parse(error.message);
        showErrorNotification({
          title: 'Failed to update membership',
          error: parsedError,
        });
      } catch (e) {
        // Report old error as is:
        showErrorNotification({
          title: 'Failed to update membership',
          error: new Error(error.message),
        });
      }
    },
  });

  const removeAndRefundMemberMutation = trpc.clubMembership.removeAndRefundMember.useMutation({
    async onSuccess() {
      await queryUtils.clubMembership.getInfinite.invalidate();
    },
    onError(error) {
      try {
        // If failed in the FE - TRPC error is a JSON string that contains an array of errors.
        const parsedError = JSON.parse(error.message);
        showErrorNotification({
          title: 'Failed to remove and refund user',
          error: parsedError,
        });
      } catch (e) {
        // Report old error as is:
        showErrorNotification({
          title: 'Failed to remove and refund user',
          error: new Error(error.message),
        });
      }
    },
  });

  const updateClubResourceMutation = trpc.club.updateResource.useMutation({
    async onSuccess() {
      await queryUtils.clubMembership.getInfinite.invalidate();
    },
    onError(error) {
      try {
        // If failed in the FE - TRPC error is a JSON string that contains an array of errors.
        const parsedError = JSON.parse(error.message);
        showErrorNotification({
          title: 'Failed to update resource',
          error: parsedError,
        });
      } catch (e) {
        // Report old error as is:
        showErrorNotification({
          title: 'Failed to update resource',
          error: new Error(error.message),
        });
      }
    },
  });

  const removeClubResourceMutation = trpc.club.removeResource.useMutation({
    async onSuccess() {
      await queryUtils.clubMembership.getInfinite.invalidate();
    },
    onError(error) {
      try {
        // If failed in the FE - TRPC error is a JSON string that contains an array of errors.
        const parsedError = JSON.parse(error.message);
        showErrorNotification({
          title: 'Failed to remove resource',
          error: parsedError,
        });
      } catch (e) {
        // Report old error as is:
        showErrorNotification({
          title: 'Failed to remove resource',
          error: new Error(error.message),
        });
      }
    },
  });

  const handleUpsertClub = (data: UpsertClubInput) => {
    return upsertClubMutation.mutateAsync(data);
  };

  const handleUpsertClubTier = (data: UpsertClubTierInput) => {
    return upsertClubTierMutation.mutateAsync(data);
  };
  const handleUpsertClubResource = (data: UpsertClubResourceInput) => {
    return upsertClubResourceMutation.mutateAsync(data);
  };
  const handleUpsertClubPost = (data: UpsertClubPostInput) => {
    return upsertClubPostMutation.mutateAsync(data);
  };
  const handleCreateClubMembership = (data: CreateClubMembershipInput) => {
    return createClubMembershipMutation.mutateAsync(data);
  };
  const handleUpdateClubMembership = (data: UpdateClubMembershipInput) => {
    return updateClubMembershipMutation.mutateAsync(data);
  };
  const handleRemoveAndRefundMemberMutation = (data: OwnerRemoveClubMembershipInput) => {
    return removeAndRefundMemberMutation.mutateAsync(data);
  };
  const handleUpdateClubResourceMutation = (data: UpdateClubResourceInput) => {
    return updateClubResourceMutation.mutateAsync(data);
  };
  const handleRemoveClubResourceMutation = (data: RemoveClubResourceInput) => {
    return removeClubResourceMutation.mutateAsync(data);
  };

  return {
    upsertClub: handleUpsertClub,
    upserting: upsertClubMutation.isLoading,
    upsertClubTier: handleUpsertClubTier,
    upsertingTier: upsertClubTierMutation.isLoading,
    upsertClubResource: handleUpsertClubResource,
    upsertingResource: upsertClubResourceMutation.isLoading,
    upsertClubPost: handleUpsertClubPost,
    upsertingClubPost: upsertClubPostMutation.isLoading,
    createClubMembership: handleCreateClubMembership,
    creatingClubMembership: createClubMembershipMutation.isLoading,
    updateClubMembership: handleUpdateClubMembership,
    updatingClubMembership: updateClubMembershipMutation.isLoading,
    removeAndRefundMember: handleRemoveAndRefundMemberMutation,
    removingAndRefundingMember: removeAndRefundMemberMutation.isLoading,
    updateResource: handleUpdateClubResourceMutation,
    updatingResource: updateClubResourceMutation.isLoading,
    removeResource: handleRemoveClubResourceMutation,
    removingResource: removeClubResourceMutation.isLoading,
  };
};

export const useEntityAccessRequirement = ({
  entityType,
  entityId,
}: {
  entityType?: SupportedClubEntities;
  entityId?: number;
}) => {
  const { data: entityAccess, isLoading: isLoadingAccess } = trpc.common.getEntityAccess.useQuery(
    {
      entityId: entityId as number,
      entityType: entityType as SupportedClubEntities,
    },
    {
      enabled: !!entityId && !!entityType,
    }
  );

  const hasAccess = isLoadingAccess ? false : entityAccess?.hasAccess ?? false;

  const { data: clubRequirement } = trpc.common.getEntityClubRequirement.useQuery(
    {
      entityId: entityId as number,
      entityType: entityType as SupportedClubEntities,
    },
    {
      enabled: !!entityId && !!entityType && !hasAccess && !isLoadingAccess,
    }
  );

  const requiresClub = clubRequirement?.requiresClub ?? false;

  return {
    hasAccess,
    requiresClub,
    isLoadingAccess,
  };
};

export const useQueryClubPosts = (
  clubId: number,
  filters?: Partial<GetInfiniteClubPostsSchema>,
  options?: { keepPreviousData?: boolean; enabled?: boolean }
) => {
  const { data, ...rest } = trpc.clubPost.getInfiniteClubPosts.useInfiniteQuery(
    {
      clubId,
      ...filters,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      ...options,
    }
  );
  const currentUser = useCurrentUser();
  const {
    users: hiddenUsers,
    images: hiddenImages,
    tags: hiddenTags,
    isLoading: isLoadingHidden,
  } = useHiddenPreferencesContext();

  const clubPosts = useMemo(() => {
    if (isLoadingHidden) return [];
    const items = data?.pages.flatMap((x) => x.items) ?? [];
    return applyUserPreferencesClubPost<ClubPostGetAll[number]>({
      items,
      currentUserId: currentUser?.id,
      hiddenImages,
      hiddenTags,
      hiddenUsers,
    });
  }, [data?.pages, hiddenImages, hiddenTags, hiddenUsers, currentUser, isLoadingHidden]);

  return { data, clubPosts, ...rest };
};

export const getUserClubRole = ({ userId, userClub }: { userId: number; userClub?: UserClub }) => {
  if (!userClub) return null;

  const membership = userClub.membership;
  return membership?.role;
};

export const useClubContributorStatus = ({ clubId }: { clubId?: number }) => {
  const { data: userClubs = [], ...rest } = trpc.club.userContributingClubs.useQuery(undefined, {
    enabled: !!clubId,
  });
  const currentUser = useCurrentUser();

  const { userClub, role, membership } = useMemo(() => {
    if (!userClubs || !currentUser)
      return {
        userClub: null,
        role: null,
        membership: null,
      };

    const userClub = userClubs.find((x) => x.id === clubId);

    return {
      userClub,
      role: getUserClubRole({ userId: currentUser.id, userClub }),
      membership: userClub?.membership,
    };
  }, [userClubs, currentUser, clubId]);

  return {
    role,
    userClub,
    membership,
    isOwner: currentUser && userClub?.userId === currentUser?.id,
    ...rest,
  };
};

export const useQueryClubMembership = (
  clubId: number,
  filters?: Partial<GetInfiniteClubMembershipsSchema>,
  options?: { keepPreviousData?: boolean; enabled?: boolean }
) => {
  const currentUser = useCurrentUser();
  const { data, ...rest } = trpc.clubMembership.getInfinite.useInfiniteQuery(
    {
      ...filters,
      clubId,
    },
    {
      enabled: !!currentUser,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      ...options,
    }
  );

  const memberships = useMemo(() => {
    return data?.pages.flatMap((x) => x.items) ?? [];
  }, [data?.pages]);

  return { memberships, ...rest };
};

export const useQueryClubResources = (
  clubId: number,
  filters?: Partial<GetPaginatedClubResourcesSchema>,
  options?: { keepPreviousData?: boolean; enabled?: boolean }
) => {
  const currentUser = useCurrentUser();
  const { data, ...rest } = trpc.club.getPaginatedClubResources.useQuery(
    {
      ...filters,
      clubId,
    },
    {
      enabled: !!currentUser,
      ...options,
    }
  );

  if (data) {
    const { items: resources = [], ...pagination } = data;
    return { resources, pagination, ...rest };
  }

  return { resources: [], pagination: null, ...rest };
};

export const useClubFilters = () => {
  const storeFilters = useFiltersContext((state) => state.clubs);
  return removeEmpty(storeFilters);
};

export const useQueryClubs = (
  filters: Partial<GetInfiniteClubSchema>,
  options?: { keepPreviousData?: boolean; enabled?: boolean }
) => {
  const { data, ...rest } = trpc.club.getInfinite.useInfiniteQuery(filters, {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    ...options,
  });
  const currentUser = useCurrentUser();
  const {
    images: hiddenImages,
    tags: hiddenTags,
    users: hiddenUsers,
    isLoading: isLoadingHidden,
  } = useHiddenPreferencesContext();

  const clubs = useMemo(() => {
    if (isLoadingHidden) return [];
    const items = data?.pages.flatMap((x) => x.items) ?? [];
    return applyUserPreferencesClub<ClubGetAll[number]>({
      items,
      currentUserId: currentUser?.id,
      hiddenImages,
      hiddenTags,
      hiddenUsers,
    });
  }, [data?.pages, hiddenImages, hiddenTags, hiddenUsers, currentUser, isLoadingHidden]);

  return { data, clubs, ...rest };
};
