---
title: Tests are stories
date: 2024-06-28T00:00:00+03:00
---

Because of the way I was repeatedly taught about how to test software, it always confused me. Many lessons out there talk about unit tests, or otherwise show unrealistically simple examples. They tell you how to pass values to a function, and how to assert its return value.

In web application development, that's rarely what you need from tests to have confidence that your app will not come crashing down.

Instead, you want to write stories. Like children's stories. Concise, clear, and gives a message at the end.

> Once upon a time, there was an almighty accountant. They knew all numbers, they knew everyone's accounts.
> 
> There was a category and a checking account that belonged to a knight with a white horse.
>
> The knight told the accountant they spent 10 shillings from the category on that faithful day.
> 
> The almighty accountant has accepted this, and recorded the transaction in their holy book!

Now, of course I don't imagine fables like this for every single test I write. That would be totally silly. No sire!

I instead make the story in the language of PHPUnit.

```php
class AddingTransactionsTest extends TestCase
{
    #[Test]
    public function user_can_create_expense_transaction(): void
    {
        $category = Category::factory()->create();
        $account = Account::factory()->for($category->group->budget)->create();

        $this->actingAs($category->group->budget->user)
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

It starts by setting up the fairy world, acts the main occasion, and ends with the moral of the story and the lessons.

Just for the fun of it, let's also do a negative outcome story.

> Once upon a time, there was an almighty accountant. They knew all numbers, they knew everyone's accounts.
> 
> There was a category and a checking account that belonged to a knight with a white horse.
>
> The ugly witch told the accountant the knight had spent 10 shillings from the category on that faithful day.
> 
> The almighty accountant has rejected this, saying they don't know what knight the witch is talking about.

```php
class AddingTransactionsTest extends TestCase
{
    #[Test]
    public function users_cannot_create_transactions_to_others_accounts(): void
    {
        $category = Category::factory()->create();
        $account = Account::factory()->for($category->group->budget)->create();

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

Each story is one page in your [test suite] book.

## Stories need to be unscattered

> Once upon a time, there was an almighty accountant. They knew all numbers, they knew everyone's accounts.
>
> The ugly witch told the accountant the knight has spent 10 shillings from the category on that faithful day.
> 
> The almighty app has rejected this, saying it doesn't know what knight the witch is talking about.

This makes some sense, but it's clear _something_ is missing, right? Like, what knight? What category?? Even the almighty accountant doesn't know.

Then you turn the pages back to the beginning of the chapter, and notice that they said...

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
            ->for($this->category->group->budget)
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

The story is dispersed to weakly connected pages. You need to jump between pages to see the full picture. Maybe just one page, maybe 10s of pages. Your mind struggles to maintain the image of this fairy world.

Keep your story in one place, and keep it fluent.

## Longer stories are fine

> Once upon a time, there was an almighty accountant. They knew all numbers, they knew everyone's accounts.
> 
> There was a checking account that belonged to a knight with a white horse.
>
> The knight had made 95 shillings in the beginning of the harvest season.
>
> Until the end of the season, the knight had spent 10 shillings on bread, 10 shillings on ale, and 15 shillings on taxes.
>
> The knight knew he will have to spend another 20 shillings by the next growing season, but also make another 90 until then.
> 
> When the knight asked the accountant what his financial situation is...
>
> The almighty accountant told him he has 60 shillings now, and will have 135 shillings left for spending until the end of growing season.

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
            'transaction_date' => today()->subDays(5),
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

Quite the long test method, right? But is it confusing when you read from start to end? I don't think so.

I much rather see directly in front of my eyes why the account balance came to be `60 * 100`. It's always more cognitive load  if I need to jump between distant places of the code.

## Abstraction is okay, creating test data externally isn't

### Your tests don't care about every detail

Just like database communications are abstracted to Eloquent models (compared to writing SQL queries), we also defer plenty of other things to some abstractions that run behind the scene.

- No tests ever boot up Laravel, for example, that's done in `Illuminate\Foundation\Testing\TestCase`.
- We don't use only the most basic `$this->assertTrue()` function, we use abstracted assertion logic.

In the storytelling metaphor, I didn't define what a checking account is. I assumed the reader (the test runner) knows that.

--

In the same spirit you can abstract things yourself, too. Maybe you have some specific implementation detail, and you don't want to have that within your test methods.

```php
class ListingCategoriesTest extends TestCase
{
    public function setUp()
    {
        parent::setUp();

        // I'm effectively disabling this listener here, because I don't want
        // category auto-population in any of the tests here. I want all of
        // these tests to control what categories exist in the system.
        $this->fake(\App\Listeners\PopulateCategoriesOfNewBudget::class);
    }
}
```

If you have a 3rd party integration and you don't want to control every bit of the interaction with it, you can abstract it in a way where you only need to define the details you care in test methods.

```php
class SomePurchasingFlowTest extends TestCase
{
    public function failed_payment_is_communicated_to_user()
    {
        // Test doesn't necessarily care how Stripe is mocked,
        // so it's abstracted.
        $this->mockStripePayment(
            result: StripeResult::PaymentFailed,
        );

        $this
            ->actingAs(User::factory()->create())
            ->postJson('/v1/purchase', [
                'products' => [
                    Product::factory()->create()->id,
                ],
            ])
            ->assertPaymentRequired();
    }
}
```

--

You might have also noticed that my code mentions an entity called budget. But nowhere in the test method do I create or define it. That's because a budget's existence is not immediately relevant to these test cases I displayed so far. The budget is created in a factory automatically based on the factory definitions.

```php
class AccountFactory extends ModelFactory
{
    public function definition(): array
    {
        return [
            'budget_id' => Budget::factory(),
            'name' => $this->faker->words(3, true),
        ];
    }
}
```

The awesome model factories of Laravel enables me to only create the data I care about in my tests, and it handles all the rest of data creation for me.

If another test cares about what specific budget is created, the test explicitly creates it.

```php
class CreatingAccountsTest extends TestCase
{
    #[Test]
    public function it_rejects_budget_id_of_another_user(): void
    {
        $user = User::factory()->create();

        // I want a specific budget here that is created for the given user.
        $budget = Budget::factory()->recycle($user)->create();

        $this->actingAs(User::factory()->create())
            ->postJson('v1/accounts', [
                'name' => 'Test Account',
                'budget_id' => $budget->id,
            ])
            ->assertJsonValidationErrors([
                'budget_id',
            ]);
    }
}
```

### Test methods need to maintain control of the world building

Implicitly or explicitly, a test method should have complete control over all the data created for its execution.

We have already touched upon implicit data creation just above with factories creating needed data behind the scenes. Continuing that conversation; even if the test doesn't create a budget explicitly, it still has complete control over what kind of budget is created. It can always create its own budget instance, and tell `AccountFactory` to use it.

What's **not** ideal is creating anything before or after the test method runs in a common and unspecific place, such as `setUp` method. Or worse, in traits' setup methods, in the extended parent classes like `Tests\TestCase`.

Let's take another look at the example from _Stories need to be unscattered_ section:

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
            ->for($this->category->group->budget)
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

| Need | With externally created data | With only internally created data |
|----|----|----|
| New test that needs a single different category to exist in its world | It needs to update the one created outside | It creates the category it needs |
| New test that needs no categories to exist | It needs to remove the one created outside | It creates no categories |
| New test that asserts some category count | It has to account for the category created outside | It doesn't need to account for categories created outside |

Also, the test story would start like "there was a category but then it was removed, don't worry about it". That's a terrible story...

In the real world, this might not be a problem with some of your tests throughout the lifetime of your software and it might never require to be refactored.

When you _do_ need to refactor it, however, do you really want to refactor tens of test methods that have no direct relation with the feature you're building?

And what's the trade we are making here? Avoiding duplicating a couple lines of code in each test? Not worth the bad story if you ask me.

## Conclusion

Tests are the one thing in a software project where I intentionally keep things as verbose as necessary. This has helped me so far in how I think about my product's behavior, and in how I describe it as code. The whole test suit paints a clear picture of the software, and I see it as the seedlings of a proper product documentation.

Give it a go sometime for one feature test, and tell me how you feel about it!

You can find me in places via my [about page](/about).
