"""LLM client using OpenAI-compatible API."""

import json
from typing import List, Dict, Optional, Any
from openai import OpenAI


class LLMClient:
    """Client for interacting with LLMs via OpenAI-compatible API."""

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        model: str = "gpt-4"
    ):
        """Initialize LLM client.

        Args:
            api_key: API key for the LLM service
            base_url: Base URL for API (None for OpenAI default)
            model: Model name to use
        """
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url
        )
        self.model = model

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        response_format: Optional[Dict] = None
    ) -> str:
        """Get chat completion from LLM.

        Args:
            messages: List of message dicts with 'role' and 'content'
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response
            response_format: Optional response format (e.g., {"type": "json_object"})

        Returns:
            Response content as string
        """
        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }

        if max_tokens:
            kwargs["max_tokens"] = max_tokens

        if response_format:
            kwargs["response_format"] = response_format

        response = self.client.chat.completions.create(**kwargs)

        return response.choices[0].message.content

    def analyze_dependencies(
        self,
        changes_summary: str,
        dependency_list: str
    ) -> Dict[str, Any]:
        """Use LLM to analyze dependencies between changes.

        Args:
            changes_summary: Summary of all changes
            dependency_list: List of detected dependencies

        Returns:
            Dictionary with analysis results
        """
        prompt = f"""Analyze the following code changes and their dependencies.

# Changes:
{changes_summary}

# Detected Dependencies:
{dependency_list}

For each dependency, assess:
1. Is it correct?
2. What is the strength (0.0-1.0)?
3. Can it be violated or is it critical?

Also identify any missing dependencies that should be added.

Respond in JSON format:
{{
  "validated_dependencies": [
    {{"source": "change_id", "target": "change_id", "strength": 1.0, "reason": "..."}}
  ],
  "missing_dependencies": [
    {{"source": "change_id", "target": "change_id", "strength": 1.0, "reason": "..."}}
  ],
  "notes": "Any additional observations"
}}
"""

        messages = [
            {"role": "system", "content": "You are a code analysis expert specializing in dependency analysis."},
            {"role": "user", "content": prompt}
        ]

        response = self.chat_completion(
            messages=messages,
            temperature=0.3,
            response_format={"type": "json_object"}
        )

        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {"error": "Failed to parse LLM response", "raw_response": response}

    def identify_semantic_groups(
        self,
        changes_summary: str,
        dependencies: str
    ) -> Dict[str, Any]:
        """Use LLM to identify semantic groups.

        Args:
            changes_summary: Summary of all changes
            dependencies: Dependency information

        Returns:
            Dictionary with semantic groups
        """
        prompt = f"""Given these code changes and dependencies, identify semantic groups that represent coherent units of work.

# Changes:
{changes_summary}

# Dependencies:
{dependencies}

Consider:
- Changes to the same feature/component
- Refactoring patterns (renames, extractions)
- API changes and their usages
- Test changes related to implementation changes

Respond in JSON format:
{{
  "groups": [
    {{
      "name": "group name",
      "change_ids": ["change1", "change2"],
      "description": "what these changes accomplish together",
      "cohesion_score": 0.9
    }}
  ]
}}
"""

        messages = [
            {"role": "system", "content": "You are a code analysis expert specializing in semantic code understanding."},
            {"role": "user", "content": prompt}
        ]

        response = self.chat_completion(
            messages=messages,
            temperature=0.5,
            response_format={"type": "json_object"}
        )

        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {"error": "Failed to parse LLM response", "raw_response": response}

    def propose_patch_split(
        self,
        changes_summary: str,
        dependencies: str,
        atomic_groups: str,
        semantic_groups: str,
        target_patch_size: int
    ) -> Dict[str, Any]:
        """Use LLM to propose a patch split.

        Args:
            changes_summary: Summary of all changes
            dependencies: Dependency information
            atomic_groups: Groups that cannot be split
            semantic_groups: Semantic groupings
            target_patch_size: Target size for patches

        Returns:
            Dictionary with proposed patches
        """
        prompt = f"""You are a code patch splitting agent. Split the following changes into reviewable patches.

# Changes:
{changes_summary}

# Dependencies:
{dependencies}

# Atomic Groups (cannot be split):
{atomic_groups}

# Semantic Groups:
{semantic_groups}

# Target patch size: ~{target_patch_size} lines

# Constraints (CRITICAL):
1. A function definition and ALL its usages must be in the same patch or the definition must come first
2. New functions must be defined before or with their first usage
3. Deleted code must come after its last usage is removed
4. Import/include changes must precede code that uses them
5. Each patch must be independently compilable
6. Respect atomic groups - they cannot be split

# Task:
Split the changes into patches that:
- Respect all dependencies and constraints
- Are roughly {target_patch_size} lines each
- Have clear, focused purposes
- Are ordered topologically

Respond in JSON format:
{{
  "patches": [
    {{
      "id": 1,
      "name": "Add UserService interface",
      "description": "Introduces new service interface",
      "change_ids": ["change1", "change2"],
      "rationale": "Must come first as subsequent patches use this interface"
    }}
  ],
  "dependency_order": [1, 2, 3, 4],
  "reasoning": "Explanation of the splitting strategy"
}}
"""

        messages = [
            {"role": "system", "content": "You are a code patch splitting expert. Your goal is to split code changes into reviewable patches while preserving correctness."},
            {"role": "user", "content": prompt}
        ]

        response = self.chat_completion(
            messages=messages,
            temperature=0.3,
            max_tokens=4000,
            response_format={"type": "json_object"}
        )

        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {"error": "Failed to parse LLM response", "raw_response": response}

    def validate_patches(
        self,
        patches_summary: str,
        dependencies: str
    ) -> Dict[str, Any]:
        """Use LLM to validate patches.

        Args:
            patches_summary: Summary of proposed patches
            dependencies: Dependency information

        Returns:
            Dictionary with validation results
        """
        prompt = f"""Validate the following patch split for correctness.

# Proposed Patches:
{patches_summary}

# Dependencies:
{dependencies}

Check for:
1. Are all dependencies satisfied?
2. Is the ordering correct?
3. Are there any potential compilation or runtime errors?
4. Are the patches well-balanced and reviewable?

Respond in JSON format:
{{
  "is_valid": true,
  "issues": ["list of any issues found"],
  "suggestions": ["list of suggestions for improvement"],
  "overall_assessment": "brief assessment"
}}
"""

        messages = [
            {"role": "system", "content": "You are a code review expert validating patch splits."},
            {"role": "user", "content": prompt}
        ]

        response = self.chat_completion(
            messages=messages,
            temperature=0.3,
            response_format={"type": "json_object"}
        )

        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {"error": "Failed to parse LLM response", "raw_response": response}
