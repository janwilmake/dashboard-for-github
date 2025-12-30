Motivation - https://x.com/RhysSullivan/status/1918486708565492170 - great first painpoint to focus on and start a github replacement.

Previous thread: https://x.com/janwilmake/status/1883817352287924463

POC:

- oauth with private repo and org access
- monetization: $10 per month
- nightly sync
  - sync repos in a nightly cronjob for everyone
  - sync prs: search with `is:pr is:open review-requested:@me` and `is:pr is:open author:@me`
  - prerender and store in kv an html for the user
- when visiting the homepage:
  - if logged out, render landingpage
  - if logged in but not subscribed, render pricing and button to pay
  - if logged in and subscribed, render:
    - a superfast landingpage with your repos (comes from kv)
    - button to manage subscription
    - button to logout
    - button to context.forgithub.com

design: make it look super similar to the GitHub homepage, but say "not affiliated with GitHub" on the landing page. adapt colour scheme to system theme.

Can you give me the full implementation? should be a single file worker.ts
