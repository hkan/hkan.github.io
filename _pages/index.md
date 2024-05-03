---
layout: page
title: Home
id: home
permalink: /
---

<div>
  {% assign recent_notes = site.notes | sort: "date_timestamp" | reverse %}

  <div class="flex flex-col gap-4">
    {% for note in recent_notes limit: 5 %}
      <article>
        <p class="text-lg"><a class="font-medium tracking-tight internal-link text-stone-700" href="{{ site.baseurl }}{{ note.url }}">{{ note.title }}</a></p>
        <p class="text-stone-500">Published on {{ note.date | date: "%A" }}, {{ note.date | date_to_long_string }}</p>
      </article>
    {% endfor %}
  </div>
</div>
