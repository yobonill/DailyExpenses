# Daily Expenses v2.2.1 — test hotfix

Replace only:

- `src/lib/financialReview.test.ts`

This changes no runtime/application behavior. It corrects the regression assertion so Firebase-invalid **object keys** are detected while audit `path` strings such as `moneyTransactions/<id>` remain allowed as values.

Then run:

```bash
npm test
npm run build
```
