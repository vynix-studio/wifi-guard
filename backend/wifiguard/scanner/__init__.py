"""Cross-platform Wi-Fi scanner dispatch.

Picks the right OS-native scanner at import time so the rest of the app
never has to branch on platform.
"""

import platform

_system = platform.system()

if _system == "Windows":
    from .windows_scanner import scan  # noqa: F401
elif _system == "Linux":
    from .linux_scanner import scan  # noqa: F401
else:
    def scan() -> list[dict]:
        raise NotImplementedError(
            f"WiFiGuard scanning is not supported on platform: {_system}"
        )
