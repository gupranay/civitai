import {
  Badge,
  Divider,
  Group,
  MantineSize,
  Rating,
  Stack,
  Text,
  useMantineTheme,
} from '@mantine/core';
import {
  IconStar,
  IconUpload,
  IconUsers,
  IconHeart,
  IconDownload,
  IconChecks,
  IconUser,
  IconArrowDown,
  IconStarFilled,
} from '@tabler/icons-react';

import { IconBadge } from '~/components/IconBadge/IconBadge';
import { abbreviateNumber, formatToLeastDecimals } from '~/utils/number-helpers';
import { StatTooltip } from '~/components/Tooltips/StatTooltip';
import { StarRating } from '../StartRating/StarRating';

const mapBadgeTextIconSize: Record<MantineSize, { textSize: MantineSize; iconSize: number }> = {
  xs: { textSize: 'xs', iconSize: 12 },
  sm: { textSize: 'xs', iconSize: 14 },
  md: { textSize: 'sm', iconSize: 14 },
  lg: { textSize: 'sm', iconSize: 16 },
  xl: { textSize: 'md', iconSize: 18 },
};

const UserStat = ({
  value,
  icon,
  subtext,
}: {
  value: number | string;
  icon: React.ReactNode;
  subtext: string;
}) => {
  return (
    <Stack spacing={0} align="center">
      <Group spacing={0}>
        <Text size="md">{value}</Text>
        {icon}
      </Group>
      <Text tt="uppercase" color="dimmed" size={10} weight={510}>
        {subtext}
      </Text>
    </Stack>
  );
};
export function UserStats({ rating, followers, downloads, favorites }: Props) {
  return (
    <Group spacing={0} align="center" position="apart" noWrap>
      {favorites != null && (
        <UserStat
          value={abbreviateNumber(favorites)}
          icon={<IconHeart size={16} />}
          subtext="Likes"
        />
      )}
      {followers != null && (
        <UserStat
          value={abbreviateNumber(followers)}
          icon={<IconUser size={16} />}
          subtext="Followers"
        />
      )}
      {downloads != null && (
        <UserStat
          value={abbreviateNumber(downloads)}
          icon={<IconArrowDown size={16} />}
          subtext="Downloads"
        />
      )}
      {rating != null && (
        <UserStat
          value={formatToLeastDecimals(rating.value)}
          icon={<IconStarFilled size={16} />}
          subtext={`${abbreviateNumber(rating.count)} Ratings`}
        />
      )}
    </Group>
  );
}

type Props = {
  favorites?: number;
  followers?: number;
  downloads?: number;
  rating?: { value: number; count: number };
};
