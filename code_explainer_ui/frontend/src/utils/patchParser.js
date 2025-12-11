/**
 * Parses unified diff format patch content and extracts individual file diffs
 */
export const parsePatch = (patchContent) => {
  const lines = patchContent.split('\n');
  const files = [];
  let currentFile = null;
  let diffLines = [];
  let isInDiff = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip patch header comments
    if (line.startsWith('#')) {
      continue;
    }

    // Start of a new file diff
    if (line.startsWith('diff --git')) {
      // Save previous file if exists
      if (currentFile && diffLines.length > 0) {
        files.push({
          ...currentFile,
          diff: diffLines.join('\n')
        });
      }

      // Extract file paths from "diff --git a/path b/path"
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (match) {
        currentFile = {
          fileName: match[2], // Use the new file path
          oldPath: match[1],
          newPath: match[2]
        };
        diffLines = [];
        isInDiff = false;
      }
      continue;
    }

    // File mode/index information
    if (line.startsWith('index ') || line.startsWith('new file mode') || 
        line.startsWith('deleted file mode') || line.startsWith('old mode') || 
        line.startsWith('new mode')) {
      continue;
    }

    // File headers (--- and +++)
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      diffLines.push(line);
      continue;
    }

    // Diff hunk header (@@)
    if (line.startsWith('@@')) {
      isInDiff = true;
      diffLines.push(line);
      continue;
    }

    // Diff content
    if (isInDiff) {
      diffLines.push(line);
    }
  }

  // Don't forget the last file
  if (currentFile && diffLines.length > 0) {
    files.push({
      ...currentFile,
      diff: diffLines.join('\n')
    });
  }

  return files;
};

/**
 * Extracts old and new versions of a file from unified diff
 */
export const extractFileVersions = (diffContent) => {
  const lines = diffContent.split('\n');
  const oldLines = [];
  const newLines = [];
  let oldLineNumber = 1;
  let newLineNumber = 1;

  for (const line of lines) {
    // Skip diff headers
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      // Extract line numbers from hunk header
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
        if (match) {
          oldLineNumber = parseInt(match[1]);
          newLineNumber = parseInt(match[2]);
        }
      }
      continue;
    }

    if (line.startsWith('-')) {
      // Line removed from old version
      oldLines.push(line.substring(1));
      oldLineNumber++;
    } else if (line.startsWith('+')) {
      // Line added to new version  
      newLines.push(line.substring(1));
      newLineNumber++;
    } else {
      // Unchanged line (context)
      const content = line.startsWith(' ') ? line.substring(1) : line;
      oldLines.push(content);
      newLines.push(content);
      oldLineNumber++;
      newLineNumber++;
    }
  }

  return {
    oldVersion: oldLines.join('\n'),
    newVersion: newLines.join('\n')
  };
};

/**
 * Gets the file extension for syntax highlighting
 */
export const getFileExtension = (fileName) => {
  if (!fileName) return 'text';
  
  const ext = fileName.split('.').pop().toLowerCase();
  
  // Map common extensions to Prism.js language names
  const extensionMap = {
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'py': 'python',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'rb': 'ruby',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'json': 'json',
    'xml': 'xml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'sql': 'sql',
    'md': 'markdown',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'ini': 'ini',
    'dockerfile': 'docker'
  };

  return extensionMap[ext] || 'text';
};

/**
 * Gets a human-readable file type name
 */
export const getFileTypeName = (fileName) => {
  const ext = getFileExtension(fileName);
  
  const typeNames = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript', 
    'jsx': 'React JSX',
    'tsx': 'React TSX',
    'python': 'Python',
    'java': 'Java',
    'c': 'C',
    'cpp': 'C++',
    'go': 'Go',
    'rust': 'Rust',
    'php': 'PHP',
    'ruby': 'Ruby',
    'bash': 'Shell Script',
    'json': 'JSON',
    'xml': 'XML',
    'html': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'markdown': 'Markdown',
    'yaml': 'YAML',
    'text': 'Text'
  };

  return typeNames[ext] || 'Unknown';
};

/**
 * Parses a hunk header to extract line information
 * Example: "@@ -52,6 +52,7 @@ class Config(BaseModel):" -> {oldStart: 52, oldCount: 6, newStart: 52, newCount: 7, context: "class Config(BaseModel):"}
 */
export const parseHunkHeader = (hunkHeader) => {
  const match = hunkHeader.match(/@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@\s*(.*)/);
  
  if (!match) return null;
  
  return {
    oldStart: parseInt(match[1]),
    oldCount: parseInt(match[2] || '1'),
    newStart: parseInt(match[3]),
    newCount: parseInt(match[4] || '1'),
    context: match[5] || ''
  };
};

/**
 * Finds annotations that match a specific hunk in the diff
 */
export const findAnnotationsForHunk = (hunkHeader, annotations, fileName) => {
  if (!hunkHeader || !annotations.length) return [];
  
  const parsedHunk = parseHunkHeader(hunkHeader);
  if (!parsedHunk) return [];
  
  return annotations.filter(annotation => {
    // Check if file path matches
    const fileMatches = annotation.file_path === fileName || 
                       annotation.file_path.endsWith('/' + fileName) ||
                       fileName.endsWith('/' + annotation.file_path);
    
    if (!fileMatches) return false;
    
    // Parse annotation hunk header
    /*
    const annotationHunk = parseHunkHeader(annotation.hunk_header);
    if (!annotationHunk) return false;
    
    // Check if hunk headers match (same line ranges and context)
    return parsedHunk.oldStart === annotationHunk.oldStart &&
           parsedHunk.newStart === annotationHunk.newStart &&
           parsedHunk.context.trim() === annotationHunk.context.trim();
           */
    // For simplicity, just check if the context lines match
    if (!annotation.hunk_header.trim().includes(parsedHunk.context.trim())) {
      return false;
    }
    
    return parsedHunk.oldStart == annotation.start_line &&
           parsedHunk.newStart == annotation.end_line;
  });
};

/**
 * Extracts hunk headers from diff content
 */
export const extractHunkHeaders = (diffContent) => {
  const lines = diffContent.split('\n');
  const hunkHeaders = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('@@')) {
      hunkHeaders.push({
        header: line,
        lineIndex: i,
        parsed: parseHunkHeader(line)
      });
    }
  }
  
  return hunkHeaders;
};