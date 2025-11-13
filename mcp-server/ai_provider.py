"""
Multi-Provider AI Service
Unified interface for Gemini, OpenAI, Anthropic, and Azure OpenAI
"""
import os
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
import anthropic
from openai import OpenAI, AzureOpenAI
import google.generativeai as genai

@dataclass
class AIMessage:
    """Standardized AI message format"""
    content: str
    model: str
    usage: Dict[str, int]
    finish_reason: str

class AIProvider:
    """Unified AI provider interface"""
    
    def __init__(
        self,
        provider: str = "gemini",
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        endpoint: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 4096
    ):
        self.provider = provider.lower()
        self.api_key = api_key or self._get_default_key()
        self.model = model or self._get_default_model()
        self.endpoint = endpoint
        self.temperature = temperature
        self.max_tokens = max_tokens
        
        self._initialize_client()
    
    def _get_default_key(self) -> str:
        """Get API key from environment"""
        key_map = {
            "gemini": "GEMINI_API_KEY",
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "azure": "AZURE_OPENAI_API_KEY"
        }
        env_var = key_map.get(self.provider, "")
        return os.getenv(env_var, "")
    
    def _get_default_model(self) -> str:
        """Get default model for provider"""
        models = {
            "gemini": "gemini-2.0-flash-exp",
            "openai": "gpt-4o",
            "anthropic": "claude-3-5-sonnet-20241022",
            "azure": "gpt-4o"
        }
        return models.get(self.provider, "")
    
    def _initialize_client(self):
        """Initialize provider-specific client"""
        if self.provider == "gemini":
            genai.configure(api_key=self.api_key)
            self.client = genai.GenerativeModel(self.model)
        elif self.provider == "openai":
            self.client = OpenAI(api_key=self.api_key)
        elif self.provider == "anthropic":
            self.client = anthropic.Anthropic(api_key=self.api_key)
        elif self.provider == "azure":
            self.client = AzureOpenAI(
                api_key=self.api_key,
                azure_endpoint=self.endpoint or "",
                api_version="2024-02-15-preview"
            )
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")
    
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        image_data: Optional[bytes] = None
    ) -> AIMessage:
        """Generate response from AI provider"""
        if self.provider == "gemini":
            return self._generate_gemini(prompt, system_prompt, image_data)
        elif self.provider == "openai":
            return self._generate_openai(prompt, system_prompt, image_data)
        elif self.provider == "anthropic":
            return self._generate_anthropic(prompt, system_prompt, image_data)
        elif self.provider == "azure":
            return self._generate_azure(prompt, system_prompt, image_data)
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")
    
    def _generate_gemini(
        self,
        prompt: str,
        system_prompt: Optional[str],
        image_data: Optional[bytes]
    ) -> AIMessage:
        """Generate with Gemini"""
        contents = []
        
        if system_prompt:
            # Simulate system prompt with user/model exchange
            contents.extend([
                {"role": "user", "parts": [{"text": system_prompt}]},
                {"role": "model", "parts": [{"text": "Understood. I will follow these instructions."}]}
            ])
        
        user_parts = [{"text": prompt}]
        if image_data:
            import PIL.Image
            import io
            image = PIL.Image.open(io.BytesIO(image_data))
            user_parts.append(image)
        
        contents.append({"role": "user", "parts": user_parts})
        
        response = self.client.generate_content(
            contents,
            generation_config=genai.types.GenerationConfig(
                temperature=self.temperature,
                max_output_tokens=self.max_tokens
            )
        )
        
        return AIMessage(
            content=response.text,
            model=self.model,
            usage={
                "prompt_tokens": response.usage_metadata.prompt_token_count,
                "completion_tokens": response.usage_metadata.candidates_token_count,
                "total_tokens": response.usage_metadata.total_token_count
            },
            finish_reason=str(response.candidates[0].finish_reason)
        )
    
    def _generate_openai(
        self,
        prompt: str,
        system_prompt: Optional[str],
        image_data: Optional[bytes]
    ) -> AIMessage:
        """Generate with OpenAI"""
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        user_content = [{"type": "text", "text": prompt}]
        if image_data:
            import base64
            b64_image = base64.b64encode(image_data).decode('utf-8')
            user_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"}
            })
        
        messages.append({"role": "user", "content": user_content})
        
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens
        )
        
        return AIMessage(
            content=response.choices[0].message.content,
            model=response.model,
            usage={
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            },
            finish_reason=response.choices[0].finish_reason
        )
    
    def _generate_anthropic(
        self,
        prompt: str,
        system_prompt: Optional[str],
        image_data: Optional[bytes]
    ) -> AIMessage:
        """Generate with Anthropic Claude"""
        content = [{"type": "text", "text": prompt}]
        
        if image_data:
            import base64
            b64_image = base64.b64encode(image_data).decode('utf-8')
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": b64_image
                }
            })
        
        response = self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            system=system_prompt or "",
            messages=[{"role": "user", "content": content}]
        )
        
        return AIMessage(
            content=response.content[0].text,
            model=response.model,
            usage={
                "prompt_tokens": response.usage.input_tokens,
                "completion_tokens": response.usage.output_tokens,
                "total_tokens": response.usage.input_tokens + response.usage.output_tokens
            },
            finish_reason=response.stop_reason
        )
    
    def _generate_azure(
        self,
        prompt: str,
        system_prompt: Optional[str],
        image_data: Optional[bytes]
    ) -> AIMessage:
        """Generate with Azure OpenAI (same as OpenAI)"""
        return self._generate_openai(prompt, system_prompt, image_data)

# Singleton instance management
_provider_instance: Optional[AIProvider] = None

def get_ai_provider(
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    endpoint: Optional[str] = None
) -> AIProvider:
    """Get or create AI provider instance"""
    global _provider_instance
    
    if _provider_instance is None or provider is not None:
        _provider_instance = AIProvider(
            provider=provider or os.getenv("AI_PROVIDER", "gemini"),
            api_key=api_key,
            model=model,
            endpoint=endpoint
        )
    
    return _provider_instance

def set_provider_config(config: Dict[str, Any]):
    """Set provider configuration from Supabase settings"""
    global _provider_instance
    _provider_instance = AIProvider(
        provider=config.get("provider", "gemini"),
        api_key=config.get("apiKey", ""),
        model=config.get("model", ""),
        endpoint=config.get("endpoint"),
        temperature=config.get("temperature", 0.3),
        max_tokens=config.get("maxTokens", 4096)
    )
