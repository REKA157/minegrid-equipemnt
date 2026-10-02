"""
LLM client interface + factory.

All LLM calls go through this abstraction so the provider can be swapped
via LLM_PROVIDER env var (none / mock / openai).

Constaté le 2026-10-01 : sans clé configurée, la fabrique renvoyait EN SILENCE
le client simulé (MockLLMClient), et ses réponses fabriquées (besoins d'engins
« excavator 4-8 », budget 350 M USD, acteurs « AECOM »…) remontaient jusqu'au
front comme une vraie analyse (« Comparer IA »). Désormais :
  - chaque client déclare `simulated` (True pour le client simulé) ;
  - `llm_is_simulated()` dit, sans appel réseau, si une VRAIE IA est configurée ;
  - les réponses d'analyse portent un champ `simulated` (contrat partagé avec le
    front : simulated=true → badge « Simulation — aucune IA n'est configurée sur
    le radar », aucun chiffre de la simulation affiché comme une donnée).
Avec une vraie clé (LLM_PROVIDER=openai + LLM_API_KEY), rien ne change.
"""
from __future__ import annotations
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any
from app.config import get_settings

logger = logging.getLogger("monitor.llm.client")


@dataclass
class LLMResponse:
    text: str
    model: str
    tokens_used: int


class BaseLLMClient(ABC):
    # True seulement pour un client qui FABRIQUE ses réponses (aucune IA réelle).
    simulated: bool = False

    @abstractmethod
    async def complete(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        ...


def _real_llm_configured(settings: Any) -> bool:
    """Vraie IA = fournisseur « openai » ET clé non vide (texte).

    Constaté le 2026-10-01 : LLM_PROVIDER=openai sans LLM_API_KEY construisait
    quand même un client OpenAI à clé vide, qui échouait (401) à chaque appel.
    Sans clé, il n'y a pas d'IA : c'est le mode simulé, signalé comme tel.
    """
    provider = str(getattr(settings, "llm_provider", "") or "").strip().lower()
    key = getattr(settings, "llm_api_key", "")
    return provider == "openai" and isinstance(key, str) and bool(key.strip())


def llm_is_simulated(settings: Any = None) -> bool:
    """True si aucune vraie IA n'est configurée (les analyses seraient simulées)."""
    return not _real_llm_configured(settings if settings is not None else get_settings())


def get_llm_client() -> BaseLLMClient:
    """Factory — returns the configured LLM client."""
    settings = get_settings()

    if _real_llm_configured(settings):
        from app.llm.openai_client import OpenAIClient
        return OpenAIClient(api_key=settings.llm_api_key, model=settings.llm_model)

    if str(settings.llm_provider or "").strip().lower() == "openai":
        logger.warning(
            "LLM_PROVIDER=openai mais LLM_API_KEY est vide : client SIMULÉ, les "
            "analyses seront marquées simulated=true et jamais enregistrées."
        )
    from app.llm.mock_client import MockLLMClient
    return MockLLMClient()
