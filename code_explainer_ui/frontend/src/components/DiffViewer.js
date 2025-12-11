import React, { useMemo, useEffect } from 'react';
import { parseDiff, Diff, Hunk, Decoration, getChangeKey } from 'react-diff-view';
import { Box, Typography, Chip, Paper, Tooltip, IconButton, Divider } from '@mui/material';
import { Info as InfoIcon } from '@mui/icons-material';
import {
  getFileExtension,
  getFileTypeName,
  parseHunkHeader,
  findAnnotationsForHunk
} from '../utils/patchParser';
import { colors } from '../App';
import FilePath from './FilePath';
import 'react-diff-view/style/index.css';
import '../styles/prism-themes.css';

const DiffViewer = ({ patchContent, currentFile, annotations = [] }) => {
  // Load Prism.js for syntax highlighting
  useEffect(() => {
    const loadPrism = async () => {
      try {
        // Dynamically import Prism.js
        const Prism = await import('prismjs');
        
        // Load common language components
        await Promise.all([
          import('prismjs/components/prism-javascript'),
          import('prismjs/components/prism-typescript'),
          import('prismjs/components/prism-python'),
          import('prismjs/components/prism-java'),
          import('prismjs/components/prism-json'),
          import('prismjs/components/prism-yaml'),
          import('prismjs/components/prism-markdown'),
          import('prismjs/components/prism-bash'),
          import('prismjs/components/prism-css'),
          import('prismjs/components/prism-go'),
          import('prismjs/components/prism-rust')
        ]);
        
        // Apply highlighting
        Prism.default.highlightAll();
      } catch (error) {
        console.warn('Failed to load Prism.js syntax highlighting:', error);
      }
    };

    loadPrism();
  }, [patchContent]);

  const parsedFiles = useMemo(() => {
    if (!patchContent) return [];
    try {
      return parseDiff(patchContent);
    } catch (error) {
      console.error('Error parsing diff:', error);
      return [];
    }
  }, [patchContent]);

  const currentFileData = useMemo(() => {
    if (!currentFile || !parsedFiles.length) return null;

    // Find the file by name (react-diff-view uses different structure)
    const fileData = parsedFiles.find(f =>
      f.newPath === currentFile ||
      f.oldPath === currentFile ||
      f.newPath?.endsWith('/' + currentFile) ||
      f.oldPath?.endsWith('/' + currentFile) ||
      currentFile.endsWith('/' + (f.newPath || f.oldPath))
    );

    if (!fileData) return null;

    return {
      ...fileData,
      fileName: fileData.newPath || fileData.oldPath,
      language: getFileExtension(fileData.newPath || fileData.oldPath),
      typeName: getFileTypeName(fileData.newPath || fileData.oldPath)
    };
  }, [currentFile, parsedFiles]);

  // Find annotations for the current file
  const fileAnnotations = useMemo(() => {
    if (!currentFile || !annotations.length) return [];
    
    return annotations.filter(annotation => 
      annotation.file_path === currentFile || 
      annotation.file_path.endsWith('/' + currentFile) ||
      currentFile.endsWith('/' + annotation.file_path)
    );
  }, [currentFile, annotations]);

  // Create widgets for annotations using react-diff-view's widget system
  const widgets = useMemo(() => {
    if (!currentFileData?.hunks || !fileAnnotations.length) return {};
    
    const widgetMap = {};
    
    // Iterate through all hunks and changes to find annotation matches
    currentFileData.hunks.forEach(hunk => {
      const hunkHeader = hunk.content; // The @@ line
      
      // Find annotations that match this hunk
      const matchingAnnotations = findAnnotationsForHunk(hunkHeader, fileAnnotations, currentFile);
      
      if (matchingAnnotations.length > 0) {
        // Find the first change in this hunk to attach the widget
        const firstChange = hunk.changes.find(change => change.type !== 'normal' || change.lineNumber);
        if (firstChange) {
          const changeKey = getChangeKey(firstChange);
          widgetMap[changeKey] = (
            <Box sx={{
              p: 1.5,
              backgroundColor: 'rgba(99, 102, 241, 0.08)',
              border: `1px solid ${colors.primary.light}`,
              borderLeft: `3px solid ${colors.primary.main}`,
              borderRadius: 1,
              mb: 1
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <InfoIcon sx={{ fontSize: 16, color: colors.primary.main, mr: 1 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: colors.primary.dark }}>
                  {matchingAnnotations.length} Annotation{matchingAnnotations.length > 1 ? 's' : ''}
                </Typography>
              </Box>
              {matchingAnnotations.map((annotation, idx) => (
                <Box key={idx} sx={{ mb: idx < matchingAnnotations.length - 1 ? 1 : 0 }}>
                  <Typography variant="body2" sx={{ color: colors.text.primary }}>
                    {annotation.description}
                  </Typography>
                  {annotation.start_line && annotation.end_line && (
                    <Typography variant="caption" sx={{ color: colors.text.secondary, display: 'block', mt: 0.5 }}>
                      Lines {annotation.start_line}-{annotation.end_line}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          );
        }
      }
    });
    
    return widgetMap;
  }, [currentFileData, fileAnnotations, currentFile]);

  if (!currentFileData) {
    return (
      <Paper elevation={1} sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No diff data available for this file
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          File: {currentFile || 'Unknown'}
        </Typography>
      </Paper>
    );
  }


  return (
    <Box sx={{ width: '100%' }}>
      {/* File Info Header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        mb: 2,
        p: 2,
        backgroundColor: colors.background.paper,
        borderRadius: 1,
        border: `1px solid ${colors.border.light}`
      }}>
        <Box sx={{ flexGrow: 1, mr: 2 }}>
          <FilePath path={currentFileData.fileName} sx={{ fontSize: '0.95rem' }} />
        </Box>
        <Chip
          label={currentFileData.typeName}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ mr: 1 }}
        />
        {fileAnnotations.length > 0 && (
          <Tooltip
            title={
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Annotations ({fileAnnotations.length})
                </Typography>
                {fileAnnotations.map((annotation, index) => (
                  <Box key={index} sx={{ mb: index < fileAnnotations.length - 1 ? 2 : 0 }}>
                    <Typography variant="caption" sx={{ color: colors.primary.light, display: 'block', fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
                      {annotation.hunk_header}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {annotation.description}
                    </Typography>
                    {annotation.start_line && annotation.end_line && (
                      <Typography variant="caption" sx={{ color: colors.text.muted, display: 'block', mt: 0.5 }}>
                        Lines {annotation.start_line}-{annotation.end_line}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            }
            arrow
            placement="bottom-start"
            componentsProps={{
              tooltip: {
                sx: {
                  backgroundColor: colors.text.primary,
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  maxWidth: 500,
                  border: `1px solid ${colors.border.dark}`
                }
              },
              arrow: {
                sx: {
                  color: colors.text.primary
                }
              }
            }}
          >
            <IconButton size="small" sx={{ color: colors.primary.main }}>
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Diff Viewer */}
      <Paper elevation={1} sx={{ overflow: 'hidden', border: `1px solid ${colors.border.light}`, width: '100%' }}>
        <Box sx={{
          width: '100%',
          '& .diff-view': {
            fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
            fontSize: '13px',
            width: '100%'
          },
          '& .diff-hunk-header': {
            backgroundColor: colors.background.subtle,
            color: colors.text.secondary,
            borderTop: `1px solid ${colors.border.light}`,
            borderBottom: `1px solid ${colors.border.light}`
          },
          '& .diff-hunk': {
            width: '100%',
            marginBottom: '16px',
            '&:not(:last-child)': {
              paddingBottom: '16px',
              borderBottom: `2px solid ${colors.border.main}`
            }
          },
          '& .diff-line': {
            lineHeight: '1.2'
          },
          '& .diff-line-add': {
            backgroundColor: colors.diff.addition.bg
          },
          '& .diff-line-delete': {
            backgroundColor: colors.diff.deletion.bg
          },
          '& .diff-gutter-add': {
            backgroundColor: 'rgba(16, 185, 129, 0.2)'
          },
          '& .diff-gutter-delete': {
            backgroundColor: 'rgba(239, 68, 68, 0.2)'
          },
          '& .diff-code-insert': {
            backgroundColor: 'rgba(16, 185, 129, 0.3)'
          },
          '& .diff-code-delete': {
            backgroundColor: 'rgba(239, 68, 68, 0.3)'
          },
          '& .diff': {
            width: '100%'
          },
          '& .diff-hunk': {
            width: '100%'
          }
        }}>
          <Diff
            viewType="split"
            diffType={currentFileData.type}
            hunks={currentFileData.hunks}
            widgets={widgets}
          >
            {hunks => hunks.flatMap((hunk, index) => {
              const elements = [<Hunk key={hunk.content} hunk={hunk} />];
              // Add a divider between hunks (but not after the last one)
              if (index < hunks.length - 1) {
                elements.push(
                  <Decoration key={`divider-${index}`}>
                    <Box sx={{
                      borderTop: `2px solid ${colors.border.main}`,
                      margin: '16px 0',
                      width: '100%'
                    }} />
                  </Decoration>
                );
              }
              return elements;
            })}
          </Diff>
        </Box>
      </Paper>
    </Box>
  );
};

export default DiffViewer;