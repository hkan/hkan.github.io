---
title: How I gradually migrated a Vue app to React
date: 2024-04-24T23:20:00+03:00
---

By the end of last year, me and my team have completed the gradual migration of an company-internal web app written in Vue 2 over to React. It spanned over a period of 8 months, working on & off the project. The whole thing ended up being a major benefit in multiple areas.

The new React app is not a 1-to-1 rewrite of the old one. Throughout the migration process, we examined every single feature of the app together with the relevant stakeholders and decided to do things differently in a couple key features. That provided a major boost to the daily work of my colleagues. It also helped me and my whole team to be much more closer to other departments in the company, creating more active communication channels and behaviours between us and everyone else.

It aspired confidence in the team to tackle a similar migration work for the user-facing and much larger apps, creating a movement towards more modern architecture in our codebases.

---

## How we pulled it off

- Made a priority & importance list of features
- Started building a new React app from scratch with the first item on the list, and made it live on a separate subdomain
- After one full feature, implemented a beta switch to both apps, redirecting to new React app when the page user visits is ready, redirecting to old app when it isn't
- Iterate over the feature list to rewrite them in the new app, marking their pages ready in the beta switcher as soon as possible
- Tracked usages and gather feedback to fix bugs, improve functionality, and learn about user behaviours
- When the new app had all the features, we stopped the service of the old app, removed the beta switcher, and at that point pretty much everyone was constantly using the new app, so nobody even noticed

## Key takeaways

- Changing tech stack just for the sake of it is near impossible to justify from a business perspective.
- Talking to customers is wildly helpful. And I mean simply talking to them, not rigid interview-like discovery processes. In our case this was extremely easy since my customers were literally in the next room in the office.
- Shutting off the outside world and writing a new app for multiple months is not a good way to advance a product.
- Don't need to rush migrations. As long as it's viable to seamlessly transition user between two (almost identical) apps, do it slowly and gradually, all the while being mindful about the whole product and what it provides.
