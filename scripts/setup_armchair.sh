#!/bin/bash

set -e

echo "🪑 Armchair Setup Script"
echo "========================"

# Function to find git root directory
find_git_root() {
    local path="$1"
    while [ "$path" != "/" ]; do
        if [ -d "$path/.git" ]; then
            echo "$path"
            return 0
        fi
        path=$(dirname "$path")
    done
    return 1
}

# Function to calculate relative path (compatible with macOS)
get_relative_path() {
    local from="$1"
    local to="$2"
    
    # Convert to absolute paths
    from=$(cd "$from" && pwd)
    to=$(cd "$to" && pwd)
    
    # If paths are the same, return "."
    if [ "$from" = "$to" ]; then
        echo "."
        return 0
    fi
    
    # Remove common prefix
    local common="$from"
    local result=""
    
    # Find the longest common prefix
    while [ "${to#$common/}" = "$to" ] && [ "$common" != "/" ]; do
        common=$(dirname "$common")
    done
    
    # Build relative path
    if [ "$common" = "/" ]; then
        # No common path, return absolute path
        echo "$to"
    else
        # Calculate relative path
        local forward=""
        local temp="$from"
        while [ "$temp" != "$common" ]; do
            if [ -z "$forward" ]; then
                forward=".."
            else
                forward="../$forward"
            fi
            temp=$(dirname "$temp")
        done
        
        local remainder="${to#$common/}"
        if [ -z "$remainder" ]; then
            echo "$forward"
        elif [ -z "$forward" ]; then
            echo "$remainder"
        else
            echo "$forward/$remainder"
        fi
    fi
}

# Function to get or assign workspace for git root
get_workspace_for_git_root() {
    local git_root="$1"
    local workspace_name=""
    
    # Check if this git root already has a workspace assignment
    for i in "${!git_roots[@]}"; do
        if [ "${git_roots[$i]}" = "$git_root" ]; then
            echo "${workspace_assignments[$i]}"
            return 0
        fi
    done
    
    # New git root, assign a new workspace
    workspace_name="workspace$workspace_counter"
    git_roots+=("$git_root")
    workspace_assignments+=("$workspace_name")
    workspace_counter=$((workspace_counter + 1))
    echo "$workspace_name"
}

# Check if ARMCHAIR_HOME is set
if [ -z "$ARMCHAIR_HOME" ]; then
    echo "❌ Error: ARMCHAIR_HOME environment variable is not set."
    echo "Please set ARMCHAIR_HOME to point to your Armchair workspace directory."
    echo "Example: export ARMCHAIR_HOME=/path/to/your/armchair/workspace"
    exit 1
fi

echo "✅ ARMCHAIR_HOME is set to: $ARMCHAIR_HOME"

# Create ARMCHAIR_HOME directory if it doesn't exist
if [ ! -d "$ARMCHAIR_HOME" ]; then
    echo "📁 Creating ARMCHAIR_HOME directory: $ARMCHAIR_HOME"
    mkdir -p "$ARMCHAIR_HOME"
fi

# Handle ARMCHAIR_OUTPUT directory
if [ -z "$ARMCHAIR_OUTPUT" ]; then
    OUTPUT_DIR="$ARMCHAIR_HOME/output"
    echo "📂 ARMCHAIR_OUTPUT not set. Creating output directory: $OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"
    echo "💡 Consider setting: export ARMCHAIR_OUTPUT=$OUTPUT_DIR"
else
    echo "✅ ARMCHAIR_OUTPUT is set to: $ARMCHAIR_OUTPUT"
fi

# Ask user about AI model API preference
echo ""
echo "🤖 AI Model Configuration"
echo "========================"
echo "Please choose your preferred AI model API:"
echo "1) Claude (Anthropic)"
echo "2) OpenAI"
echo "3) Other OpenAI-compatible API"
echo ""

while true; do
    read -p "Enter your choice (1-3): " api_choice
    
    case $api_choice in
        1)
            echo "✅ Using Claude API"
            MODEL_API_TYPE="claude"
            # Don't set any model variables for Claude
            unset MODEL_API_BASE_URL
            unset MODEL_NAME
            break
            ;;
        2)
            echo "✅ Using OpenAI API"
            MODEL_API_TYPE="openai"
            MODEL_API_BASE_URL="https://api.openai.com/v1"
            read -p "Enter OpenAI model name (e.g., gpt-4o, gpt-3.5-turbo): " MODEL_NAME
            if [ -z "$MODEL_NAME" ]; then
                echo "❌ Model name cannot be empty"
                continue
            fi
            break
            ;;
        3)
            echo "✅ Using other OpenAI-compatible API"
            MODEL_API_TYPE="other"
            read -p "Enter API base URL (e.g., https://api.example.com/v1): " MODEL_API_BASE_URL
            if [ -z "$MODEL_API_BASE_URL" ]; then
                echo "❌ API base URL cannot be empty"
                continue
            fi
            read -p "Enter model name: " MODEL_NAME
            if [ -z "$MODEL_NAME" ]; then
                echo "❌ Model name cannot be empty"
                continue
            fi
            break
            ;;
        *)
            echo "❌ Invalid choice. Please enter 1, 2, or 3."
            ;;
    esac
done

# Handle ARMCHAIR_SOURCE_YAML configuration
if [ -z "$ARMCHAIR_SOURCE_YAML" ]; then
    CONFIG_DIR="$ARMCHAIR_HOME/config"
    CONFIG_FILE="$CONFIG_DIR/source.yaml"
    
    echo "⚙️  ARMCHAIR_SOURCE_YAML not set. Setting up configuration..."
    
    # Create config directory
    mkdir -p "$CONFIG_DIR"
    
    # Check if default source.yaml already exists
    if [ -f "$CONFIG_FILE" ]; then
        echo "📄 Found existing configuration file: $CONFIG_FILE"
        echo ""
        cat "$CONFIG_FILE"
        echo ""
        read -p "Do you want to reuse this existing configuration? (y/n): " reuse_config
        
        if [ "$reuse_config" = "y" ] || [ "$reuse_config" = "Y" ]; then
            echo "✅ Reusing existing configuration"
            # Parse existing config to generate ARMCHAIR_FS_MAP
            echo "🗺️  Parsing existing configuration for file system mappings..."
            
            # Extract repository names from YAML (simple parsing)
            repo_names=($(grep -E "^\s*-\s*name:" "$CONFIG_FILE" | awk -F: '{print $2}' | sed 's/[[:space:]"]*//g'))
            
            # For existing config, we need to ask for original paths to create FS_MAP
            declare -a fs_mappings=()
            declare -a git_roots=()
            declare -a workspace_assignments=()
            workspace_counter=1
            
            for repo_name in "${repo_names[@]}"; do
                read -p "Enter the original local path for repository '$repo_name': " original_path
                if [ ! -z "$original_path" ]; then
                    # Expand tilde to home directory
                    original_path="${original_path/#\~/$HOME}"
                    
                    # Find git root for this repository
                    git_root=$(find_git_root "$original_path")
                    if [ $? -eq 0 ]; then
                        echo "📁 Found git root for $repo_name: $git_root"
                        workspace=$(get_workspace_for_git_root "$git_root")
                        echo "🗂️  Assigned to workspace: $workspace"
                        fs_mappings+=("$git_root:/$workspace")
                    else
                        echo "⚠️  Warning: $original_path is not in a git repository"
                        echo "📁 Using repository path directly for $repo_name"
                        workspace="workspace$workspace_counter"
                        workspace_counter=$((workspace_counter + 1))
                        fs_mappings+=("$original_path:/$workspace")
                    fi
                fi
            done
            
            # Generate ARMCHAIR_FS_MAP (remove duplicates using sort/uniq)
            if [ ${#fs_mappings[@]} -gt 0 ]; then
                FS_MAP=$(printf '%s\n' "${fs_mappings[@]}" | sort -u | tr '\n' ',' | sed 's/,$//')
            else
                FS_MAP=""
            fi
            
            # Generate env.sh file
            ENV_FILE="$ARMCHAIR_HOME/armchair_env.sh"
            echo "📄 Writing environment variables to: $ENV_FILE"
            
            cat > "$ENV_FILE" << EOF
#!/bin/bash
# Armchair Environment Variables
# Generated by setup_armchair.sh on $(date)

export ARMCHAIR_HOME="$ARMCHAIR_HOME"
export ARMCHAIR_SOURCE_YAML="$CONFIG_FILE"
export ARMCHAIR_FS_MAP="$FS_MAP"
EOF
            
            # Add model configuration variables only if they are set
            if [ ! -z "$MODEL_API_BASE_URL" ]; then
                echo "export ARMCHAIR_MODEL_API_BASE_URL=\"$MODEL_API_BASE_URL\"" >> "$ENV_FILE"
            fi
            
            if [ ! -z "$MODEL_NAME" ]; then
                echo "export ARMCHAIR_MODEL_NAME=\"$MODEL_NAME\"" >> "$ENV_FILE"
            fi
            
            if [ -z "$ARMCHAIR_OUTPUT" ]; then
                echo "export ARMCHAIR_OUTPUT=\"$OUTPUT_DIR\"" >> "$ENV_FILE"
            else
                echo "export ARMCHAIR_OUTPUT=\"$ARMCHAIR_OUTPUT\"" >> "$ENV_FILE"
            fi
            
            echo "" >> "$ENV_FILE"
            echo "echo \"✅ Armchair environment variables loaded\"" >> "$ENV_FILE"
            
            chmod +x "$ENV_FILE"
            
            echo "✅ Environment file created successfully!"
            echo ""
            echo "🗺️  File system mappings:"
            echo "export ARMCHAIR_FS_MAP=\"$FS_MAP\""
            echo ""
            echo "📋 To load these settings in your current shell, run:"
            echo "source $ENV_FILE"
        else
            echo "📝 Creating new configuration. The existing file will be overwritten."
            echo "📝 Please provide repository information:"
            CREATE_NEW_CONFIG=true
        fi
    else
        echo "📝 Please provide repository information:"
        CREATE_NEW_CONFIG=true
    fi
    
    # Only collect repo info if we're creating a new config
    if [ "$CREATE_NEW_CONFIG" = true ]; then
        # Initialize arrays for storing repo info
        declare -a repo_names=()
        declare -a repo_paths=()
        declare -a repo_languages=()
        declare -a fs_mappings=()
        declare -a git_roots=()
        declare -a workspace_assignments=()
        workspace_counter=1
    
    while true; do
        echo ""
        read -p "Enter repository name (or 'done' to finish): " repo_name
        
        if [ "$repo_name" = "done" ]; then
            break
        fi
        
        if [ -z "$repo_name" ]; then
            echo "❌ Repository name cannot be empty"
            continue
        fi
        
        read -p "Enter full path to repository: " repo_path
        if [ -z "$repo_path" ]; then
            echo "❌ Repository path cannot be empty"
            continue
        fi
        
        # Expand tilde to home directory
        repo_path="${repo_path/#\~/$HOME}"
        
        if [ ! -d "$repo_path" ]; then
            echo "⚠️  Warning: Directory $repo_path does not exist"
            read -p "Continue anyway? (y/n): " continue_anyway
            if [ "$continue_anyway" != "y" ] && [ "$continue_anyway" != "Y" ]; then
                continue
            fi
        fi
        
        # Find git root for this repository
        git_root=$(find_git_root "$repo_path")
        if [ $? -eq 0 ]; then
            echo "📁 Found git root: $git_root"
            workspace=$(get_workspace_for_git_root "$git_root")
            echo "🗂️  Assigned to workspace: $workspace"
            
            # Calculate relative path from git root to repo path
            relative_path=$(get_relative_path "$git_root" "$repo_path")
            if [ "$relative_path" = "." ]; then
                relative_path=""
            fi
            
            # Use git root for fs mapping, workspace path for yaml
            fs_mappings+=("$git_root:/$workspace")
            
            if [ -z "$relative_path" ]; then
                workspace_repo_path="/$workspace"
            else
                workspace_repo_path="/$workspace/$relative_path"
            fi
        else
            echo "⚠️  Warning: $repo_path is not in a git repository"
            echo "📁 Using repository path directly"
            workspace="workspace$workspace_counter"
            workspace_counter=$((workspace_counter + 1))
            fs_mappings+=("$repo_path:/$workspace")
            workspace_repo_path="/$workspace"
        fi
        
        read -p "Enter programming language (e.g., python, javascript, go, java): " repo_language
        if [ -z "$repo_language" ]; then
            echo "❌ Programming language cannot be empty"
            continue
        fi
        
        # Store repo info
        repo_names+=("$repo_name")
        repo_paths+=("$workspace_repo_path")
        repo_languages+=("$repo_language")
        
        echo "✅ Added repository: $repo_name ($repo_language) at $repo_path"
    done
    
    if [ ${#repo_names[@]} -eq 0 ]; then
        echo "❌ No repositories configured. Exiting."
        exit 1
    fi
    
    # Generate source.yaml file
    echo "📄 Writing configuration to: $CONFIG_FILE"
    
    cat > "$CONFIG_FILE" << EOF
source:
  repositories:
EOF
    
    # Add each repository to the config file
    for i in "${!repo_names[@]}"; do
        cat >> "$CONFIG_FILE" << EOF
    - name: "${repo_names[$i]}"
      path: "${repo_paths[$i]}"
      language: "${repo_languages[$i]}"
EOF
    done
    
    echo "✅ Configuration file created successfully!"
    
    # Generate ARMCHAIR_FS_MAP (remove duplicates using sort/uniq)
    if [ ${#fs_mappings[@]} -gt 0 ]; then
        FS_MAP=$(printf '%s\n' "${fs_mappings[@]}" | sort -u | tr '\n' ',' | sed 's/,$//')
    else
        FS_MAP=""
    fi
    
    # Generate env.sh file
    ENV_FILE="$ARMCHAIR_HOME/armchair_env.sh"
    echo "📄 Writing environment variables to: $ENV_FILE"
    
    cat > "$ENV_FILE" << EOF
#!/bin/bash
# Armchair Environment Variables
# Generated by setup_armchair.sh on $(date)

export ARMCHAIR_HOME="$ARMCHAIR_HOME"
export ARMCHAIR_SOURCE_YAML="$CONFIG_FILE"
export ARMCHAIR_FS_MAP="$FS_MAP"
EOF
    
    # Add model configuration variables only if they are set
    if [ ! -z "$MODEL_API_BASE_URL" ]; then
        echo "export ARMCHAIR_MODEL_API_BASE_URL=\"$MODEL_API_BASE_URL\"" >> "$ENV_FILE"
    fi
    
    if [ ! -z "$MODEL_NAME" ]; then
        echo "export ARMCHAIR_MODEL_NAME=\"$MODEL_NAME\"" >> "$ENV_FILE"
    fi
    
    if [ -z "$ARMCHAIR_OUTPUT" ]; then
        echo "export ARMCHAIR_OUTPUT=\"$OUTPUT_DIR\"" >> "$ENV_FILE"
    else
        echo "export ARMCHAIR_OUTPUT=\"$ARMCHAIR_OUTPUT\"" >> "$ENV_FILE"
    fi
    
    echo "" >> "$ENV_FILE"
    echo "echo \"✅ Armchair environment variables loaded\"" >> "$ENV_FILE"
    
    chmod +x "$ENV_FILE"
    
    echo "✅ Environment file created successfully!"
    echo ""
    echo "🗺️  File system mappings:"
    echo "export ARMCHAIR_FS_MAP=\"$FS_MAP\""
    echo ""
    echo "📋 To load these settings in your current shell, run:"
    echo "source $ENV_FILE"
    fi
    
else
    echo "✅ ARMCHAIR_SOURCE_YAML is set to: $ARMCHAIR_SOURCE_YAML"
    
    if [ ! -f "$ARMCHAIR_SOURCE_YAML" ]; then
        echo "⚠️  Warning: Configuration file does not exist at $ARMCHAIR_SOURCE_YAML"
    else
        echo "✅ Configuration file exists"
    fi
    
    # Still generate env.sh with current environment variables
    ENV_FILE="$ARMCHAIR_HOME/armchair_env.sh"
    echo "📄 Writing current environment variables to: $ENV_FILE"
    
    cat > "$ENV_FILE" << EOF
#!/bin/bash
# Armchair Environment Variables
# Generated by setup_armchair.sh on $(date)

export ARMCHAIR_HOME="$ARMCHAIR_HOME"
export ARMCHAIR_SOURCE_YAML="$ARMCHAIR_SOURCE_YAML"
EOF
    
    # Add model configuration variables if they were set
    if [ ! -z "$MODEL_API_BASE_URL" ]; then
        echo "export ARMCHAIR_MODEL_API_BASE_URL=\"$MODEL_API_BASE_URL\"" >> "$ENV_FILE"
    fi
    
    if [ ! -z "$MODEL_NAME" ]; then
        echo "export ARMCHAIR_MODEL_NAME=\"$MODEL_NAME\"" >> "$ENV_FILE"
    fi
    
    if [ ! -z "$ARMCHAIR_OUTPUT" ]; then
        echo "export ARMCHAIR_OUTPUT=\"$ARMCHAIR_OUTPUT\"" >> "$ENV_FILE"
    else
        echo "export ARMCHAIR_OUTPUT=\"$OUTPUT_DIR\"" >> "$ENV_FILE"
    fi
    
    if [ ! -z "$ARMCHAIR_FS_MAP" ]; then
        echo "export ARMCHAIR_FS_MAP=\"$ARMCHAIR_FS_MAP\"" >> "$ENV_FILE"
    fi
    
    echo "" >> "$ENV_FILE"
    echo "echo \"✅ Armchair environment variables loaded\"" >> "$ENV_FILE"
    
    chmod +x "$ENV_FILE"
    echo "✅ Environment file created successfully!"
fi

# Pull required Docker images
echo ""
echo "🐳 Pulling required Docker images..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "⚠️  Warning: Docker is not running. Skipping Docker image pulls."
    echo "   Please start Docker and run 'docker pull armchr/splitter' and 'docker pull armchr/explainer_ui' manually."
else
    echo "📥 Pulling armchr/splitter..."
    if docker pull armchr/splitter; then
        echo "✅ Successfully pulled armchr/splitter"
    else
        echo "❌ Failed to pull armchr/splitter"
    fi
    
    echo "📥 Pulling armchr/explainer_ui..."
    if docker pull armchr/explainer_ui; then
        echo "✅ Successfully pulled armchr/explainer_ui"
    else
        echo "❌ Failed to pull armchr/explainer_ui"
    fi
fi

echo ""
echo "🎉 Armchair setup complete!"
echo ""
echo "🚀 Next steps:"
echo "1. Source the environment variables: source $ARMCHAIR_HOME/armchair_env.sh"
echo "2. Run your Armchair commands"
echo ""
