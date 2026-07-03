import cloudinary
import cloudinary.uploader
from fastapi.concurrency import run_in_threadpool
from .config import settings


def configure_cloudinary():
    if settings.CLOUDINARY_URL:
        # Single URL form: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
        cloudinary.config(url=settings.CLOUDINARY_URL, secure=True)
    elif settings.CLOUDINARY_CLOUD_NAME:
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True,
        )
    else:
        raise RuntimeError(
            "Cloudinary is not configured. Set CLOUDINARY_URL in environment variables."
        )


async def upload_avatar(file_bytes: bytes, folder: str = "reach-election/avatars") -> str:
    configure_cloudinary()
    # cloudinary.uploader.upload is a blocking, synchronous network call — run
    # it in a thread pool so it doesn't stall the event loop (audit 3.6).
    result = await run_in_threadpool(
        cloudinary.uploader.upload,
        file_bytes,
        folder=folder,
        transformation=[
            {"width": 400, "height": 400, "crop": "fill", "gravity": "face"},
            {"quality": "auto", "fetch_format": "auto"},
        ],
    )
    return result["secure_url"]


async def upload_campaign_logo(file_bytes: bytes) -> str:
    configure_cloudinary()
    result = await run_in_threadpool(
        cloudinary.uploader.upload,
        file_bytes,
        folder="reach-election/logos",
        transformation=[
            {"width": 800, "height": 800, "crop": "limit"},
            {"quality": "auto", "fetch_format": "auto"},
        ],
    )
    return result["secure_url"]
