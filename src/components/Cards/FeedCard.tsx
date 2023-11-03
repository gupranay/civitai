import { AspectRatio, Card, CardProps, createStyles } from '@mantine/core';
import Link from 'next/link';
import React from 'react';

type AspectRatio = 'portrait' | 'landscape' | 'square' | 'flat';
const aspectRatioValues: Record<AspectRatio, { ratio: number; height: number; cssRatio: number }> =
  {
    portrait: {
      ratio: 7 / 9,
      height: 430,
      // CSS Ratio should be opposite to ratio as it will rely on width.
      cssRatio: 9 / 7,
    },
    landscape: {
      ratio: 9 / 7,
      height: 300,
      cssRatio: 7 / 9,
    },
    flat: {
      ratio: 15 / 7,
      height: 300,
      cssRatio: 7 / 15,
    },
    square: {
      ratio: 1,
      height: 332,
      cssRatio: 1,
    },
  };

const useStyles = createStyles<string>((theme) => ({
  root: {
    padding: '0 !important',
    color: 'white',
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    // 280 = min column width based off of CollectionHomeBlock styles grid.
    // Min height based off of portrait as it's technically the smaller possible height wise.
    minHeight: 280 * aspectRatioValues['portrait'].ratio,
  },
}));

const useCSSAspectRatioStyles = createStyles<string, { aspectRatio: number }>(
  (theme, { aspectRatio }) => ({
    root: {
      padding: '0 !important',
      color: 'white',
      borderRadius: theme.radius.md,
      cursor: 'pointer',
      position: 'relative',
      height: 0,
      paddingBottom: `${(aspectRatio * 100).toFixed(3)}% !important`,
      overflow: 'hidden',
    },
  })
);

export function FeedCard({
  href,
  children,
  aspectRatio = 'portrait',
  className,
  useCSSAspectRatio,
  ...props
}: Props) {
  const { ratio, cssRatio } = aspectRatioValues[aspectRatio];
  const { classes, cx } = useStyles();
  const { classes: cssAspectRatioClasses } = useCSSAspectRatioStyles({ aspectRatio: cssRatio });

  const card = useCSSAspectRatio ? (
    <Card<'a'>
      className={cx(cssAspectRatioClasses.root, className)}
      {...props}
      component={href ? 'a' : undefined}
    >
      <AspectRatio ratio={ratio} w="100%">
        {children}
      </AspectRatio>
    </Card>
  ) : (
    <Card<'a'>
      className={cx(classes.root, className)}
      {...props}
      component={href ? 'a' : undefined}
    >
      <AspectRatio ratio={ratio} w="100%">
        {children}
      </AspectRatio>
    </Card>
  );

  return href ? (
    <Link href={href} passHref>
      {card}
    </Link>
  ) : (
    card
  );
}

type Props = CardProps & {
  children: React.ReactNode;
  href?: string;
  aspectRatio?: AspectRatio;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  useCSSAspectRatio?: boolean;
};
