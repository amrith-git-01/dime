from __future__ import annotations

from features.notifications.push import send_expo_push


def test_send_posts_one_message_per_token(monkeypatch) -> None:
    calls: list[object] = []

    class FakeClient:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, json=None, timeout=None):
            calls.append(json)

            class R:
                status_code = 200

                def json(self):
                    return {"data": [{"status": "ok"}, {"status": "ok"}]}

            return R()

    monkeypatch.setattr("features.notifications.push.httpx.Client", lambda: FakeClient())
    send_expo_push(
        tokens=["t1", "t2"],
        title="Hi",
        body="Body",
        data={"kind": "transaction_auto"},
        on_invalid_token=lambda t: None,
    )
    assert len(calls[0]) == 2


def test_device_not_registered_prunes_token(monkeypatch) -> None:
    pruned: list[str] = []

    class FakeClient:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, json=None, timeout=None):
            class R:
                status_code = 200

                def json(self):
                    return {
                        "data": [
                            {
                                "status": "error",
                                "details": {"error": "DeviceNotRegistered"},
                            }
                        ]
                    }

            return R()

    monkeypatch.setattr("features.notifications.push.httpx.Client", lambda: FakeClient())
    send_expo_push(
        tokens=["bad"],
        title="Hi",
        body="Body",
        data={},
        on_invalid_token=lambda t: pruned.append(t),
    )
    assert pruned == ["bad"]

