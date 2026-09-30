# Custom phone blacklist (FreePBX 15)

OpDesk stores blocked numbers in the `OpDesk.blacklist` table. Asterisk never
talks to MariaDB directly — the dialplan CURLs a loopback OpDesk endpoint.

## Automatic install

On backend startup OpDesk writes `/etc/asterisk/extensions_opdesk_blacklist.conf`
and appends the following to `/etc/asterisk/extensions_custom.conf` if missing:

```
#include extensions_opdesk_blacklist.conf
```

Then runs `dialplan reload`.

## What the dialplan does

### Outbound — `[from-internal-custom]`

For dialed numbers of **5+ digits** (`_XXXXX!`):

1. `CURL http://127.0.0.1:<PORT>/api/internal/blacklist/check?number=${EXTEN}&direction=outbound`
2. If body is `1` → `Hangup()`
3. Otherwise → `Goto(from-internal-additional,...)`

Local 3–4 digit extensions stay on the mobile-wake / FreePBX path.

### Inbound — `[opdesk-from-trunk]`

FreePBX owns `[from-trunk]`; redefining it causes priority collisions. Instead:

1. In FreePBX GUI → **Connectivity → Trunks** → each trunk → **Context**
2. Set context to **`opdesk-from-trunk`** (instead of `from-trunk`)
3. The wrapper checks `CALLERID(num)` for `direction=inbound`, then
   `Goto(from-trunk,${EXTEN},1)` on pass, or `Hangup()` on hit

## Manual example (same content OpDesk writes)

```asterisk
; Outbound
[from-internal-custom]
exten => _XXXXX!,1,NoOp(OpDesk blacklist outbound check for ${EXTEN})
 same => n,GotoIf($[${LEN(${EXTEN})}>15]?passthru)
 same => n,Set(CURLOPT(conntimeout)=1)
 same => n,Set(CURLOPT(httptimeout)=2)
 same => n,Set(OPDESKBL=${CURL(http://127.0.0.1:8765/api/internal/blacklist/check?number=${EXTEN}&direction=outbound)})
 same => n,GotoIf($["${OPDESKBL}"="1"]?blocked)
 same => n(passthru),Goto(from-internal-additional,${EXTEN},1)
 same => n(blocked),Hangup()

; Inbound wrapper — set trunk Context to opdesk-from-trunk
[opdesk-from-trunk]
exten => _.,1,NoOp(OpDesk blacklist inbound CID=${CALLERID(num)})
 same => n,Set(CURLOPT(conntimeout)=1)
 same => n,Set(CURLOPT(httptimeout)=2)
 same => n,Set(OPDESKBL=${CURL(http://127.0.0.1:8765/api/internal/blacklist/check?number=${FILTER(0-9,${CALLERID(num)})}&direction=inbound)})
 same => n,GotoIf($["${OPDESKBL}"="1"]?blocked)
 same => n,Goto(from-trunk,${EXTEN},1)
 same => n(blocked),Hangup()
```

Replace `8765` with your OpDesk `PORT` if different.

## Check API

- **URL:** `GET|POST /api/internal/blacklist/check`
- **Query:** `number` (digits), `direction` = `inbound` | `outbound`
- **Access:** loopback only (`127.0.0.1` / `::1`)
- **Response:** plain `1` = block, empty body = allow

A row is active when `unblock_at > NOW()` and the matching direction flag is set.
Expired rows are hard-deleted by a 5-minute prune loop in the backend.
