"""Mock LLM client — returns realistic-looking structured responses for testing."""
from __future__ import annotations
import json
from app.llm.client import BaseLLMClient, LLMResponse


class MockLLMClient(BaseLLMClient):
    async def complete(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        # Detect which task is being requested from the system prompt
        # Prompt FR « équipements » ne contient pas « equipment » ; repère sur une clé unique du prompt.
        if "wheel_excavator" in system_prompt or "equipment" in system_prompt.lower():
            return LLMResponse(
                text=json.dumps({
                    "equipment_needs": [
                        {"category": "excavator",  "qty_min": 4, "qty_max": 8,  "confidence": 0.7, "rationale": "Excavation lourde requise pour ce type de projet"},
                        {"category": "dump_truck", "qty_min": 6, "qty_max": 12, "confidence": 0.65, "rationale": "Transport de matériaux sur site"},
                        {"category": "loader",     "qty_min": 2, "qty_max": 5,  "confidence": 0.6, "rationale": "Chargement des matériaux extraits"},
                        {"category": "dozer",      "qty_min": 2, "qty_max": 4,  "confidence": 0.6, "rationale": "Nivellement et préparation du terrain"},
                        {"category": "generator",  "qty_min": 3, "qty_max": 6,  "confidence": 0.7, "rationale": "Alimentation électrique du site"},
                    ]
                }),
                model="mock-v1",
                tokens_used=0,
            )

        if "extract" in system_prompt.lower() or "résumé" in system_prompt.lower():
            return LLMResponse(
                text=json.dumps({
                    "summary": "Projet d'infrastructure majeur en Afrique de l'Ouest, impliquant des travaux de terrassement et de construction sur plusieurs années.",
                    "dates": {
                        "start": "2025-06-01",
                        "end": "2029-12-31"
                    },
                    "budget_usd": 350000000,
                    "actors": [
                        {"name": "Ministère des Infrastructures", "role": "client"},
                        {"name": "AECOM", "role": "consultant"},
                        {"name": "China State Construction", "role": "contractor"}
                    ],
                    "locations": [
                        {"name": "Kédougou", "country": "Senegal"}
                    ]
                }),
                model="mock-v1",
                tokens_used=0,
            )

        return LLMResponse(
            text=json.dumps({"message": "Mock response", "input_length": len(user_prompt)}),
            model="mock-v1",
            tokens_used=0,
        )
