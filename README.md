# Historical Impfalarm notification service

A TypeScript/Express prototype that polls an appointment provider and stores subscriptions in Firebase, with push notifications for matching availability. Current provider compatibility, eligibility rules and live notifications are unverified.

## Isolated regression checks

```bash
npm test
```

The test runner uses the already-declared TypeScript compiler and executes the real bot/model source with fake appointment and Firebase boundaries. It never reads credential files, starts polling or sends notifications. On the shared VPS, checks reused the exact locked TypeScript4.1.5 already installed for another personal repository; a full service/native dependency installation and production build were not run.

Replacement subscriptions now validate lookup before removing the existing profile. Failed lookups preserve it; successful lookups replace it once. Both regressions failed before the fix and pass afterward. Database completion/error handling, provider/schema compatibility, request validation and notification delivery remain separate runtime gates. The historical start and deployment workflow retain their live-service behavior.
