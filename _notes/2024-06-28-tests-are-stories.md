---
title: My tests are stories
date: 2024-06-28T00:00:00+03:00
---

Because of the way I was repeatedly taught about how to test software, it always confused me. Many lessons out there talk about unit tests, or otherwise show unrealistically simple examples. They tell me how to pass values to a function, and how to assert its return value.

Unit tests have their own qualities, of course. But when I'm building a digital product, I want to have confidence that my app won't come crashing down. Testing small bits of code in isolation rarely gives me that confidence.

Instead, I write stories. Like children's stories. Concise, clear, and gives a message at the end.

> Once upon a time, there was an almighty accountant. They knew all numbers, they knew everyone's accounts.
> 
> There was a category and a checking account that belonged to a knight with a white horse.
>
> The knight told the accountant they spent 10 shillings from the category on that faithful day.
> 
> The almighty accountant accepted this, and recorded the transaction in their holy book!

Now, of course I don't imagine fables like this for every single test I write. That would be totally silly. No sire!

I instead make the story in the language of PHPUnit.

```php
class AddingTransactionsTest extends TestCase
{
    #[Test]
    public function user_can_create_expense_transaction(): void
    {
        $category = Category::factory()->create();
        $account = Account::factory()->recycle($category->budget)->create();

        $this->actingAs($category->budget->user)
            ->postJson('/v1/transactions', [
                'category_id' => $category->id,
                'account_id' => $account->id,
                'amount' => -1000,
                'transaction_date' => today()->format('Y-m-d'),
            ])
            ->assertCreated();

        $this->assertDatabaseHas(Transaction::class, [
            'category_id' => $category->id,
            'amount' => -1000,
        ]);
    }
}
```

It starts by setting up the fairy world, creating the necessary data. Acts the main occasion, the API request. Ends with the moral of the story and the lessons, that the API request has succeeded and the transaction is recorded.

Just for the fun of it, let's also do a negative outcome story.

> Once upon a time, there was an almighty accountant. They knew all numbers, they knew everyone's accounts.
> 
> There was a category and a checking account that belonged to a knight with a white horse.
>
> The ugly witch told the accountant the knight had spent 10 shillings from the category on that faithful day.
> 
> The almighty accountant rejected this, saying they don't know what knight the witch is talking about.

```php
class AddingTransactionsTest extends TestCase
{
    #[Test]
    public function users_cannot_create_transactions_to_others_accounts(): void
    {
        $category = Category::factory()->create();
        $account = Account::factory()->recycle($category->budget)->create();

        // Notice the actor is a different, new user
        $this->actingAs(User::create())
            ->postJson('/v1/transactions', [
                'category_id' => $category->id,
                'account_id' => $account->id,
                'amount' => -1000,
                'transaction_date' => today()->format('Y-m-d'),
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrorFor('account_id');
    }
}
```

Each story is one metaphorical page in my [test suite] book.

## Stories need to be linear

> Once upon a time, there was an almighty accountant. They knew all numbers, they knew everyone's accounts.
>
> <span class="text-gray-300 line-through">There was a category and a checking account that belonged to a knight with a white horse.</span>
>
> The ugly witch told the accountant the knight had spent 10 shillings from the category on that faithful day.
> 
> The almighty app has rejected this, saying it doesn't know what knight the witch is talking about.

This almost makes sense, but with the deleted part, it reads incomplete. Like, what knight? What category?? Even the almighty accountant doesn't know.

Then I turn a couple pages back to the beginning of the chapter, and notice that the book says...

> Just so you know, there is a category and a checking account that belonged to a knight with a white horse.

```php
class AddingTransactionsTest extends TestCase
{
    private Category $category;
    private Account $account;
    
    public function setUp()
    {
        parent::setUp();

        $this->category = Category::factory()->create();

        $this->account = Account::factory()
            ->for($this->category->budget)
            ->create();
    }

    // Between the setUp method above and the test method below, there are
    // somewhere between 0 and 10s of other methods.
    
    #[Test]
    public function users_cannot_create_transactions_to_others_accounts(): void
    {
        $this->actingAs(User::create())
            ->postJson('/v1/transactions', [
                'category_id' => $this->category->id,
                'account_id' => $this->account->id,
                'amount' => -1000,
                'transaction_date' => today()->format('Y-m-d'),
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrorFor('account_id');
    }
}
```

The story is split into parts with different stories in between. I need to jump between the metaphorical pages to see the full picture. Maybe just one page, maybe 10s of pages. My mind struggles to maintain the image of this fairy world.

I instead keep my story in one place, keep it linear, and keep it fluent.

## Longer stories are fine

```php
class AccountBalanceCalculationTest extends TestCase
{
    #[Test]
    public function future_transactions_affect_account_balance_when_they_are_entered(): void
    {
        $account = Account::factory()->create();
        $breadCategory = Category::factory()->recycle($account->budget)->create();
        $aleCategory = Category::factory()->recycle($account->budget)->create();
        $taxesCategory = Category::factory()->recycle($account->budget)->create();

        // Income of last harvest season
        Transaction::factory()->recycle($account)->create([
            'amount' => 95 * 100,
            'transaction_date' => today()->subDays(20),
        ]);

        // Spent 10 on bread
        Transaction::factory()->recycle($account, $breadCategory)->create([
            'amount' => -10 * 100,
            'transaction_date' => today()->subDays(5),
        ]);

        // Spent 10 on ale
        Transaction::factory()->recycle($account, $aleCategory)->create([
            'amount' => -10 * 100,
            'transaction_date' => today()->subDays(5),
        ]);

        // Spent 15 on taxes
        Transaction::factory()->recycle($account, $taxesCategory)->create([
            'amount' => -15 * 100,
            'transaction_date' => today()->subDays(5),
        ]);

        // *Will* get 90
        Transaction::factory()->recycle($account)->create([
            'amount' => 90 * 100,
            'transaction_date' => today()->addDays(10),
        ]);

        // *Will* spend 20 on taxes
        Transaction::factory()->recycle($account, $taxesCategory)->create([
            'amount' => -20 * 100,
            'transaction_date' => today()->addDays(40),
        ]);

        $account->refresh();

        $this->assertMoneyEquals(60 * 100, $account->balance);

        // Travel to after the last transaction should be entered.
        $this->travelTo(today()->addDays(50)->addMinute());

        $this->artisan(EnterTheDueScheduledTransactions::class)
            ->assertSuccessful();

        $account->refresh();

        $this->assertMoneyEquals(135 * 100, $account->balance);
    }
}
```

Quite the long test method, right? I honestly don't mind. Even when there are 10s of test methods similar to this.

My monitor fits about 35 lines in the tallest IDE viewport, this example test is 45 lines. Just a tiny bit of scroll does it. Compared to having 30 lines in `setUp`, then maybe some collapsed methods, then another 15 lines in the test method; this feels more clear.

I also much rather see directly why the account balance should evaluate to `60 * 100`. It's always more cognitive load if I need to jump between disconnected places in the test code.

In the next section, I will touch upon how to reduce crowd in test methods while still keeping up with the same standards.

## Abstraction is okay, creating test data externally isn't

### Prelude: There are already _many_ abstractions

- Database communications are abstracted with Eloquent models, we don't (usually) write SQL queries.
- No tests ever boot up Laravel, that's done in `Illuminate\Foundation\Testing\TestCase`.
- We don't use only the most basic `$this->assertTrue()` function, we use assertion functions built upon it.
- In the storytelling metaphor, I didn't define what a checking account is. I assumed the reader (the test runner) knows that.

### Creating my own abstractions to make tests even more fluent

In the same spirit I can make my own abstractions, too. Following up from the last example above, I know transaction creations are roughly the same, and in that whole test class I only care that a transaction exists with a certain amount and on certain dates.

```php
class AccountBalanceCalculationTest extends TestCase
{
    #[Test]
    public function future_transactions_affect_account_balance_when_they_are_entered(): void
    {
        $account = Account::factory()->create();
        $breadCategory = Category::factory()->recycle($account->budget)->create();
        $aleCategory = Category::factory()->recycle($account->budget)->create();
        $taxesCategory = Category::factory()->recycle($account->budget)->create();

        // Past transactions
        $this->createTrx(95 * 100,  today()->subDays(20), $account);
        $this->createTrx(-10 * 100, today()->subDays(5), $breadCategory);
        $this->createTrx(-10 * 100, today()->subDays(5), $aleCategory);
        $this->createTrx(-15 * 100, today()->subDays(5), $taxesCategory);

        // Future transactions
        $this->createTrx(90 * 100,  today()->addDays(10), $account);
        $this->createTrx(-20 * 100, today()->addDays(40), $taxesCategory);

        $account->refresh();

        $this->assertMoneyEquals(60 * 100, $account->balance);

        $this->assertAccountBalanceBecomes(
            135 * 100,
            $account,
            today()->addDays(50)->addMinute(),
        );
    }

    private function createTrx(
        int $amount,
        Carbon $date,
        Account|Category $accountOrCategory,
    ) {
        // My test function doesn't need to care what this implementation looks like.
    }

    private function assertAccountBalanceBecomes(
        int $amount,
        Account $account,
        Carbon $when,
    ) {
        // My test function doesn't need to care what this implementation looks like.
    }
}
```

Now my test method is only 22 lines, but it still ends up doing the exact same work, with the same standards.

### Model factories allow tests to stay focused on data that matters

You might have noticed that my code mentions an entity called budget. But nowhere in the tests do I create or define it. That's because a budget's existence is not immediately relevant to these tests I displayed so far. The budget is created within factories automatically.

```php
class AccountFactory extends ModelFactory
{
    public function definition(): array
    {
        return [
            'budget_id' => Budget::factory(),
            'name' => 'My budget',
        ];
    }
}
```

The awesome [Laravel model factories](https://laravel.com/docs/11.x/eloquent-factories) enable me to only create the data I care about in my tests, and it handles all the other necessary data creation for me.

With a good factory setup that covers all models, my tests never have to deal with setting up "base" data.

### Test methods need to maintain control of the world building

Implicitly or explicitly, a test method should have complete control over all the data created for its execution.

We have already touched upon implicit data creation just above with factories. Continuing that conversation; even if the test doesn't create a budget explicitly, it still has complete control over what kind of budget is created. It can always create its own budget instance, and tell `AccountFactory` to use it.

What's **not** ideal is creating anything before or after the test method runs in a common and unspecific place, such as `setUp` method. Or worse, in traits' setup methods, in the extended parent classes like `Tests\TestCase`.

Let's take another look at the example from _Stories need to be linear_ section:

```php
class AddingTransactionsTest extends TestCase
{
    private Category $category;
    private Account $account;
    
    public function setUp()
    {
        parent::setUp();

        $this->category = Category::factory()->create();

        $this->account = Account::factory()
            ->for($this->category->budget)
            ->create();
    }

    // Between the setUp method above and the test method below, there are
    // somewhere between 0 and 10s of other methods.
    
    #[Test]
    public function users_cannot_create_transactions_to_others_accounts(): void
    {
        $this->actingAs(User::create())
            ->postJson('/v1/transactions', [
                'category_id' => $this->category->id,
                'account_id' => $this->account->id,
                'amount' => -1000,
                'transaction_date' => today()->format('Y-m-d'),
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrorFor('account_id');
    }
}
```

You might have 20 test methods here, all using the exact same category and account creation in them. It might seem very reasonable to centralize them in `setUp`.

The problem with that is your individual test methods no longer have control over what accounts and categories exist in their world.

| <span class="italic whitespace-nowrap">"I need to create a new test that ..."</span> | With externally created data | With only internally created data |
|----|----|----|
| Needs a single different category to exist in its world | The new test needs to update the one created outside | The new test creates the category it needs |
| Needs no categories to exist | The new test needs to remove the one created outside | The new test creates no categories |
| Asserts some category count | The new test has to account for the category created outside | The new test doesn't need to account for categories created outside |

Also, the test story would start like "there was a category but then it was removed, don't worry about it". That's a terrible story...

Realistically speaking, this may never be a problem with some of my tests. And throughout the lifetime of my app it may never require to be refactored.

When/if I _do_ need to refactor it, however, do I really want to refactor tens of test methods that have no direct relation with the feature I'm building?

And for avoiding duplicating a couple lines of code in each test?

Not worth the terrible story in my opinion.

## Conclusion

Tests are the one thing in a software project where I don't avoid verbosity. This has helped me so far in how I think about my product's behavior, and in how I describe it as code. The whole test suite paints a clear picture of the software, and I see it as the seedlings of a proper product documentation.

Give it a go sometime for one feature test, and tell me how you feel about it!

You can find me in places via my [about page](/about).
