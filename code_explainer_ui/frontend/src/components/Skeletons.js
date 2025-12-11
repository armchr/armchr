import React from 'react';
import { Box, Skeleton, Card, CardContent } from '@mui/material';
import { colors } from '../App';

/**
 * Skeleton for repository list items
 */
export const RepositorySkeleton = ({ count = 3 }) => (
  <Box sx={{ p: 2 }}>
    {Array.from({ length: count }).map((_, i) => (
      <Box key={i} sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <Skeleton variant="circular" width={24} height={24} />
          <Skeleton variant="text" width="60%" height={24} />
          <Skeleton variant="rounded" width={32} height={20} sx={{ ml: 'auto' }} />
        </Box>
      </Box>
    ))}
  </Box>
);

/**
 * Skeleton for commit list items
 */
export const CommitSkeleton = ({ count = 5 }) => (
  <Box sx={{ pl: 2 }}>
    {Array.from({ length: count }).map((_, i) => (
      <Box
        key={i}
        sx={{
          py: 1.5,
          borderLeft: `2px solid ${colors.border.light}`,
          pl: 2,
          mb: 0.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Skeleton variant="text" width={70} height={20} sx={{ fontFamily: 'monospace' }} />
          <Skeleton variant="text" width={80} height={16} />
        </Box>
        <Skeleton variant="text" width="90%" height={18} />
        <Skeleton variant="text" width={100} height={14} sx={{ mt: 0.5 }} />
      </Box>
    ))}
  </Box>
);

/**
 * Skeleton for patch/split cards
 */
export const PatchCardSkeleton = ({ count = 3 }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i} elevation={1}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Skeleton variant="circular" width={20} height={20} />
                <Skeleton variant="text" width="70%" height={24} />
              </Box>
              <Skeleton variant="text" width="40%" height={18} sx={{ mb: 0.5 }} />
              <Skeleton variant="text" width="30%" height={18} sx={{ mb: 0.5 }} />
              <Skeleton variant="text" width="50%" height={18} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
              <Skeleton variant="text" width={80} height={20} />
              <Skeleton variant="text" width={60} height={20} />
              <Skeleton variant="text" width={90} height={20} />
              <Skeleton variant="rounded" width={80} height={32} sx={{ mt: 1 }} />
            </Box>
          </Box>
        </CardContent>
      </Card>
    ))}
  </Box>
);

/**
 * Skeleton for review cards
 */
export const ReviewCardSkeleton = ({ count = 2 }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i} elevation={1}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Skeleton variant="circular" width={24} height={24} />
              <Skeleton variant="text" width={200} height={24} />
            </Box>
            <Skeleton variant="text" width={100} height={20} />
          </Box>
          <Skeleton variant="text" width="60%" height={18} sx={{ mb: 0.5 }} />
          <Skeleton variant="text" width="40%" height={18} />
        </CardContent>
      </Card>
    ))}
  </Box>
);

/**
 * Skeleton for diff viewer
 */
export const DiffViewerSkeleton = () => (
  <Box sx={{ border: `1px solid ${colors.border.light}`, borderRadius: 2, overflow: 'hidden' }}>
    {/* File header skeleton */}
    <Box
      sx={{
        p: 2,
        backgroundColor: colors.background.subtle,
        borderBottom: `1px solid ${colors.border.light}`,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <Skeleton variant="circular" width={20} height={20} />
      <Skeleton variant="text" width="40%" height={24} />
    </Box>
    {/* Diff lines skeleton */}
    <Box sx={{ p: 0 }}>
      {Array.from({ length: 15 }).map((_, i) => (
        <Box
          key={i}
          sx={{
            display: 'flex',
            alignItems: 'center',
            py: 0.5,
            px: 2,
            backgroundColor: i % 5 === 2 ? colors.diff.addition.bg : i % 7 === 3 ? colors.diff.deletion.bg : 'transparent',
          }}
        >
          <Skeleton variant="text" width={40} height={18} sx={{ mr: 2, opacity: 0.5 }} />
          <Skeleton variant="text" width={`${40 + Math.random() * 50}%`} height={18} />
        </Box>
      ))}
    </Box>
  </Box>
);

/**
 * Skeleton for file list
 */
export const FileListSkeleton = ({ count = 5 }) => (
  <Box>
    {Array.from({ length: count }).map((_, i) => (
      <Box
        key={i}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 1,
          px: 2,
          borderBottom: `1px solid ${colors.border.light}`,
        }}
      >
        <Skeleton variant="circular" width={16} height={16} />
        <Skeleton variant="text" width={`${30 + Math.random() * 40}%`} height={20} />
      </Box>
    ))}
  </Box>
);

export default {
  RepositorySkeleton,
  CommitSkeleton,
  PatchCardSkeleton,
  ReviewCardSkeleton,
  DiffViewerSkeleton,
  FileListSkeleton,
};
