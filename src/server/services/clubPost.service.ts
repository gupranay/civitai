import { ClubAdminPermission, MetricTimeframe, Prisma } from '@prisma/client';
import {
  GetInfiniteClubPostsSchema,
  SupportedClubEntities,
  SupportedClubPostEntities,
  UpsertClubPostInput,
} from '~/server/schema/club.schema';
import { dbRead, dbWrite } from '~/server/db/client';
import { throwAuthorizationError } from '~/server/utils/errorHandling';
import { createEntityImages } from '~/server/services/image.service';
import { userContributingClubs } from '~/server/services/club.service';
import { GetByIdInput } from '~/server/schema/base.schema';
import {
  GetModelsWithImagesAndModelVersions,
  getModelsWithImagesAndModelVersions,
} from './model.service';
import { ArticleGetAllRecord, getArticles } from './article.service';
import { PostsInfiniteModel, getPostsInfinite } from './post.service';
import { ArticleSort, BrowsingMode, ModelSort, PostSort } from '../common/enums';
import { number } from 'zod';

export const getAllClubPosts = async <TSelect extends Prisma.ClubPostSelect>({
  input: { cursor, limit: take, clubId, isModerator, userId },
  select,
}: {
  input: GetInfiniteClubPostsSchema & {
    userId?: number;
    isModerator?: boolean;
  };
  select: TSelect;
}) => {
  const clubWithMembership = userId
    ? await dbRead.club.findUniqueOrThrow({
        where: { id: clubId },
        select: {
          userId: true,
          admins: {
            where: {
              userId,
            },
          },
          memberships: {
            where: {
              userId,
            },
          },
        },
      })
    : undefined;

  const includeMembersOnlyContent =
    isModerator ||
    (clubWithMembership &&
      (userId === clubWithMembership.userId ||
        clubWithMembership.memberships.length > 0 ||
        clubWithMembership.admins.length > 0))
      ? undefined
      : false;

  return dbRead.clubPost.findMany({
    take,
    cursor: cursor ? { id: cursor } : undefined,
    select,
    where: {
      clubId,
      membersOnly: includeMembersOnlyContent,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

export const getClubPostById = async <TSelect extends Prisma.ClubPostSelect>({
  input: { id, isModerator, userId },
  select,
}: {
  input: GetByIdInput & {
    userId?: number;
    isModerator?: boolean;
  };
  select: TSelect;
}) => {
  // Need to query the basics first to confirm the user has some right to access this post.
  const post = await dbRead.clubPost.findUniqueOrThrow({
    select: {
      clubId: true,
      membersOnly: true,
    },
    where: {
      id,
    },
  });

  const clubWithMembership = userId
    ? await dbRead.club.findUniqueOrThrow({
        where: { id: post.clubId },
        select: {
          userId: true,
          memberships: {
            where: {
              userId,
            },
          },
        },
      })
    : undefined;

  const includeMembersOnlyContent =
    isModerator ||
    (clubWithMembership &&
      (userId === clubWithMembership.userId || clubWithMembership.memberships.length > 0))
      ? undefined
      : false;

  if (post.membersOnly && includeMembersOnlyContent === false) {
    throw throwAuthorizationError('You do not have permission to view this post.');
  }

  return dbRead.clubPost.findUniqueOrThrow({
    select,
    where: {
      id,
    },
  });
};

export const upsertClubPost = async ({
  coverImage,
  userId,
  isModerator,
  ...input
}: UpsertClubPostInput & {
  userId: number;
  isModerator?: boolean;
}) => {
  const dbClient = dbWrite;

  const [userClub] = await userContributingClubs({ userId, clubIds: [input.clubId as number] });
  const isOwner = userClub.userId === userId;

  if (!userClub && !isModerator) {
    throw throwAuthorizationError('You do not have permission to create posts on this club.');
  }

  if (input.id) {
    const post = await dbClient.clubPost.findUniqueOrThrow({
      where: {
        id: input.id,
      },
      select: {
        id: true,
        createdById: true,
      },
    });

    const canUpdatePost = userClub.admin?.permissions.includes(ClubAdminPermission.ManagePosts);

    if (post.createdById !== userId && !isModerator && !isOwner && !canUpdatePost) {
      throw throwAuthorizationError('You do not have permission to edit this post.');
    }
  }

  const [createdCoverImage] =
    coverImage && !coverImage.id
      ? await createEntityImages({
          userId: userClub.userId, // Belongs to the club owner basically.
          images: [coverImage],
        })
      : [];

  if (input.id) {
    const post = await dbClient.clubPost.update({
      where: {
        id: input.id,
      },
      data: {
        ...input,
        coverImageId:
          coverImage === null
            ? null
            : coverImage === undefined
            ? undefined
            : coverImage?.id ?? createdCoverImage?.id,
      },
    });

    return post;
  } else {
    const post = await dbClient.clubPost.create({
      data: {
        ...input,
        createdById: userId,
        coverImageId: coverImage?.id ?? createdCoverImage?.id,
      },
    });

    return post;
  }
};

export const deleteClubPost = async ({
  id,
  userId,
  isModerator,
}: GetByIdInput & { userId: number; isModerator?: boolean }) => {
  const post = await dbRead.clubPost.findUniqueOrThrow({
    where: { id },
  });

  const [userClub] = await userContributingClubs({ userId, clubIds: [post.clubId] });

  if (!userClub && !isModerator) {
    throw throwAuthorizationError('You do not have permission to delete posts on this club.');
  }

  const isClubOwner = userClub.userId === userId;
  const canDeletePost = userClub.admin?.permissions.includes(ClubAdminPermission.ManagePosts);

  if (!isClubOwner && !isModerator && !canDeletePost) {
    throw throwAuthorizationError('You do not have permission to delete this post.');
  }

  return dbWrite.clubPost.delete({
    where: {
      id,
    },
  });
};

interface ModelClubPostResource {
  entityType: 'Model';
  data?: GetModelsWithImagesAndModelVersions;
}

interface ModelVersionClubPostResource {
  entityType: 'ModelVersion';
  data?: GetModelsWithImagesAndModelVersions;
}

interface PostClubPostResource {
  entityType: 'Post';
  data?: PostsInfiniteModel;
}

interface ArticleClubPostResource {
  entityType: 'Article';
  data?: ArticleGetAllRecord;
}

export type ClubPostData = {
  entityId: number;
} & (
  | ModelClubPostResource
  | ArticleClubPostResource
  | PostClubPostResource
  | ModelVersionClubPostResource
);

export const getClubPostResourceData = async ({
  clubPosts,
  userId,
  isModerator,
  username,
}: {
  clubPosts: {
    entityId: number;
    entityType: SupportedClubPostEntities;
  }[];
  userId?: number;
  isModerator?: boolean;
  username?: string;
}) => {
  const modelIds = clubPosts.filter((x) => x.entityType === 'Model').map((x) => x.entityId);
  const postIds = clubPosts.filter((x) => x.entityType === 'Post').map((x) => x.entityId);
  const articleIds = clubPosts.filter((x) => x.entityType === 'Article').map((x) => x.entityId);
  const modelVersionIds = clubPosts
    .filter((x) => x.entityType === 'ModelVersion')
    .map((x) => x.entityId);

  const user = userId ? { id: userId, isModerator, username } : undefined;

  const models =
    modelIds.length > 0
      ? await getModelsWithImagesAndModelVersions({
          user,
          input: {
            limit: modelIds.length,
            sort: ModelSort.Newest,
            period: MetricTimeframe.AllTime,
            periodMode: 'stats',
            browsingMode: BrowsingMode.All,
            favorites: false,
            hidden: false,
            ids: modelIds,
          },
        })
      : { items: [] };

  const articles =
    articleIds.length > 0
      ? await getArticles({
          limit: articleIds.length,
          period: MetricTimeframe.AllTime,
          periodMode: 'stats',
          sort: ArticleSort.Newest,
          browsingMode: BrowsingMode.All,
          ids: articleIds,
          sessionUser: user,
        })
      : { items: [] };

  const posts =
    postIds.length > 0
      ? await getPostsInfinite({
          limit: postIds.length,
          period: MetricTimeframe.AllTime,
          periodMode: 'published',
          sort: PostSort.Newest,
          user,
          browsingMode: BrowsingMode.All,
          ids: postIds,
          include: ['cosmetics'],
        })
      : { items: [] };

  const modelVersions =
    modelVersionIds.length > 0
      ? await getModelsWithImagesAndModelVersions({
          user,
          input: {
            limit: modelIds.length,
            sort: ModelSort.Newest,
            period: MetricTimeframe.AllTime,
            periodMode: 'stats',
            browsingMode: BrowsingMode.All,
            favorites: false,
            hidden: false,
            modelVersionIds,
          },
        })
      : { items: [] };

  const items: ClubPostData[] = clubPosts.map(({ entityId, entityType }) => {
    const base = {
      entityId,
      entityType,
    };

    switch (entityType) {
      case 'Model':
        return {
          ...base,
          entityType: 'Model',
          data: models.items.find((x) => x.id === entityId),
        };
      case 'Post':
        return {
          ...base,
          entityType: 'Post',
          data: posts.items.find((x) => x.id === entityId),
        };
      case 'Article':
        return {
          ...base,
          entityType: 'Article',
          data: articles.items.find((x) => x.id === entityId),
        };
      case 'ModelVersion':
        return {
          ...base,
          entityType: 'ModelVersion',
          data: modelVersions.items.find((x) => x.version?.id === entityId),
        };
      default:
        return base;
    }
  });

  return items;
};

export const getResourceDetailsForClubPostCreation = async ({
  entities,
  userId,
  isModerator,
  username,
}: {
  entities: [
    {
      entityId: number;
      entityType: SupportedClubPostEntities;
    }
  ];
  userId?: number;
  isModerator?: boolean;
  username?: string;
}) => {
  const postData = await dbRead.$queryRaw<
    {
      title: string | null;
      description: string | null;
      entityId: number;
      entityType: SupportedClubPostEntities;
    }[]
  >`
    WITH entities AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(entities)}::jsonb) AS v(
        "entityId" INTEGER,
        "entityType" VARCHAR
      )
    )
    SELECT  
      e."entityId",
      e."entityType",
      COALESCE(
        m.name,
        a.title,
        p.title,
        mmv.name || ' - ' || mv.name
      ) AS title,
      COALESCE (
        m.description,
        a.content,
        p.detail,
        mv.description
      ) as description
    FROM entities e 
    LEFT JOIN "Model" m ON m.id = e."entityId" AND e."entityType" = 'Model' 
    LEFT JOIN "Article" a ON a.id = e."entityId" AND e."entityType" = 'Article'
    LEFT JOIN "Post" p ON p.id = e."entityId" AND e."entityType" = 'Post'
    LEFT JOIN "ModelVersion" mv ON mv.id = e."entityId" AND e."entityType" = 'ModelVersion'
    LEFT JOIN "Model" mmv ON mmv.id = mv."modelId" 
  `;

  const data = await getClubPostResourceData({
    clubPosts: entities,
    userId,
    isModerator,
    username,
  });

  return postData.map((d) => {
    return {
      ...d,
      data: data.find((x) => x.entityId === d.entityId && x.entityType === d.entityType)?.data,
    };
  });
};
