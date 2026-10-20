# Account-bound OAuth callbacks

OAuth callbacks arrive on a provider-approved loopback host, which may differ from the initiating page's hostname and cookie scope. The gateway must select the workspace using OAuth state rather than a callback cookie.

Persist pending authorization in a permissions-restricted SQLite database beside the shared account registry. Store only a hash of the state with account ID, PKCE verifier, callback URI, trusted initiating page and expiry. The gateway looks up the account; that account's handler atomically consumes the state. Provider/account mismatches cannot consume another account's authorization. Restart does not invalidate pending consent. Expired known requests retain their return page; unknown/replayed requests return to setup with an expiry message. No callback can mark onboarding complete.
