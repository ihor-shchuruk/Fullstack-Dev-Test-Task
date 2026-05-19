from fastapi.testclient import TestClient

from app.core.config import settings


def test_metrics_allowed_for_admin(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(f"{settings.API_V1_STR}/metrics/", headers=superuser_token_headers)

    assert r.status_code == 200
    body = r.json()
    assert "users_total" in body


def test_metrics_returns_401_or_403_without_auth(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/metrics/")
    # Template returns 401 for missing token; this asserts the route exists and
    # the auth dependency runs before the body.
    assert r.status_code in (401, 403)
