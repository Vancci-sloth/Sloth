"""
Los modelos de la transcripción, fijados: el Whisper y los dos alineadores para el español. Viven en
`%APPDATA%/youtube/modelos` (`MODELOS` de `sloth.py` y `comun.py`), cada uno en una carpeta que lleva su versión: si se
cambia la versión fijada, hay que ponerlo de nuevo. Los procesos no bajan nada: los baja `instalarPythonSloth` de
`server/requisitos.ts` con `download` («Descargar todo» de Sloth), y `installed()` le dice si faltan.

Los alineadores dan los tiempos por palabra. El que se usa lo elige quien lanza `transcribir.py` (`alineador`; El Diff,
en `scripts/voz.py`):

- `voxpopuli-es`: el que WhisperX usa por defecto para el español, entrenado con VoxPopuli, CC BY-NC 4.0, solo para
  uso no comercial. El de hoy.
- `xlsr-53-es`: wav2vec2 XLSR-53 afinado para el español, Apache-2.0. Hoy sin usar: es al que cambiar si un Canal
  llega a ganar dinero.
"""

import os
from dataclasses import dataclass
from pathlib import Path

# Antes de cargar huggingface_hub: nada de estadísticas de uso ni de avisos por no poder crear enlaces en Windows.
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"


@dataclass(frozen=True)
class HuggingFaceModel:
    """Un modelo de Hugging Face en una versión fija, con los archivos que hacen falta y su tamaño."""

    name: str
    repo: str
    revision: str
    files: dict[str, int]

    def folder(self, models: Path) -> Path:
        return models / f"{self.name}-{self.revision[:8]}"

    def size(self) -> int:
        return sum(self.files.values())

    def installed(self, models: Path) -> bool:
        folder = self.folder(models)
        return all(_size_of(folder / file) == size for file, size in self.files.items())

    def download(self, models: Path) -> None:
        from huggingface_hub import hf_hub_download

        for file in self.files:
            hf_hub_download(self.repo, file, revision=self.revision, local_dir=self.folder(models))


@dataclass(frozen=True)
class TorchaudioModel:
    """Un modelo de torchaudio: un solo archivo que se comprueba con su sha256."""

    name: str
    bundle: str
    url: str
    file_size: int
    sha256: str

    def folder(self, models: Path) -> Path:
        return models / self.name

    def file(self, models: Path) -> Path:
        return self.folder(models) / self.url.rsplit("/", 1)[-1]

    def size(self) -> int:
        return self.file_size

    def installed(self, models: Path) -> bool:
        return _size_of(self.file(models)) == self.file_size

    def download(self, models: Path) -> None:
        import torch

        folder = self.folder(models)
        folder.mkdir(parents=True, exist_ok=True)
        # Lo que dejó a medias un intento anterior no se puede seguir: se empieza de cero.
        for partial in folder.glob("*.partial"):
            partial.unlink()
        torch.hub.download_url_to_file(self.url, str(self.file(models)), hash_prefix=self.sha256, progress=False)


Model = HuggingFaceModel | TorchaudioModel

WHISPER = HuggingFaceModel(
    name="whisper-large-v3-turbo",
    repo="mobiuslabsgmbh/faster-whisper-large-v3-turbo",
    revision="0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf",
    files={
        "config.json": 2263,
        "model.bin": 1617884929,
        "preprocessor_config.json": 340,
        "tokenizer.json": 2710337,
        "vocabulary.json": 1068114,
    },
)

ALIGNERS: dict[str, Model] = {
    # Sin usar: el de licencia comercial, para cuando un Canal gane dinero.
    "xlsr-53-es": HuggingFaceModel(
        name="xlsr-53-es",
        repo="jonatasgrosman/wav2vec2-large-xlsr-53-spanish",
        revision="96d7e9b4e4a78af515a3c6d3cee7c0826045d276",
        files={
            "config.json": 1531,
            "preprocessor_config.json": 262,
            "pytorch_model.bin": 1262101911,
            "special_tokens_map.json": 85,
            "vocab.json": 380,
        },
    ),
    "voxpopuli-es": TorchaudioModel(
        name="voxpopuli-es",
        bundle="VOXPOPULI_ASR_BASE_10K_ES",
        url="https://download.pytorch.org/torchaudio/models/wav2vec2_voxpopuli_base_10k_asr_es.pt",
        file_size=377686809,
        sha256="272a92b156b78e697e6c7cf7c64f274250a36d0047440e27a895a377d3af818f",
    ),
}


def aligner(name: str) -> Model:
    if name not in ALIGNERS:
        raise ValueError(f"No hay ningún alineador «{name}».")
    return ALIGNERS[name]


def needed(aligner_name: str | None) -> list[Model]:
    """Los modelos para transcribir con ese alineador; sin alineador, solo Whisper."""
    return [WHISPER] if aligner_name is None else [WHISPER, aligner(aligner_name)]


def downloaded_bytes(models: Path, model: Model) -> int:
    """Lo que ya hay en la carpeta del modelo, contando lo que se está bajando."""
    folder = model.folder(models)
    return sum(path.stat().st_size for path in folder.rglob("*") if path.is_file()) if folder.exists() else 0


def _size_of(path: Path) -> int | None:
    return path.stat().st_size if path.is_file() else None
