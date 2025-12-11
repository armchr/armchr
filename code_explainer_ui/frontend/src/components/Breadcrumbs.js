import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Link, Breadcrumbs as MuiBreadcrumbs } from '@mui/material';
import {
  Home as HomeIcon,
  NavigateNext as NavigateNextIcon,
  Folder as FolderIcon,
  Code as CodeIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import { colors } from '../App';

/**
 * Breadcrumb navigation component for deep views
 * @param {Array} items - Array of breadcrumb items: [{ label, href?, icon? }]
 */
const Breadcrumbs = ({ items = [] }) => {
  const navigate = useNavigate();

  const handleClick = (e, href) => {
    e.preventDefault();
    if (href) {
      navigate(href);
    }
  };

  const getIcon = (iconName) => {
    const iconProps = { sx: { fontSize: 16, mr: 0.5 } };
    switch (iconName) {
      case 'home':
        return <HomeIcon {...iconProps} />;
      case 'folder':
        return <FolderIcon {...iconProps} />;
      case 'code':
        return <CodeIcon {...iconProps} />;
      case 'file':
        return <DescriptionIcon {...iconProps} />;
      default:
        return null;
    }
  };

  if (!items.length) return null;

  return (
    <Box
      sx={{
        mb: 3,
        py: 1.5,
        px: 2,
        backgroundColor: colors.background.subtle,
        borderRadius: 1,
        border: `1px solid ${colors.border.light}`,
      }}
    >
      <MuiBreadcrumbs
        separator={<NavigateNextIcon sx={{ fontSize: 16, color: colors.text.muted }} />}
        sx={{
          '& .MuiBreadcrumbs-li': {
            display: 'flex',
            alignItems: 'center',
          },
        }}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          if (isLast) {
            return (
              <Box
                key={index}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  color: colors.text.primary,
                }}
              >
                {item.icon && getIcon(item.icon)}
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    color: colors.text.primary,
                  }}
                >
                  {item.label}
                </Typography>
              </Box>
            );
          }

          return (
            <Link
              key={index}
              href={item.href || '#'}
              onClick={(e) => handleClick(e, item.href)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                color: colors.text.secondary,
                textDecoration: 'none',
                '&:hover': {
                  color: colors.primary.main,
                  textDecoration: 'none',
                },
              }}
            >
              {item.icon && getIcon(item.icon)}
              <Typography variant="body2">{item.label}</Typography>
            </Link>
          );
        })}
      </MuiBreadcrumbs>
    </Box>
  );
};

export default Breadcrumbs;
