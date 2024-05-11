---
title: I write my code in the controller
date: 2024-05-11T20:00:00+0300
---

I have a theory that I have also been putting into practice:

Until you have an obvious path for abstracting your code to some other place, whether to make it reusable or just for better code organisation, it's *fine* to write it directly in your controllers.

<!--
<center>https://twitter.com/hkanaktas/status/1789271576585613664</center>
-->

---

In late 2023, I have started building a web application in my free time. Because the entrepreneur itch might decrease seasonally, but it never goes away. In majority of my previous entrepreneurial attempts, I was an idealist and tried to build the best software I could achieve. All of those attempts took way too long to build. This one had to be different, as I had limited time on my hands to design a product, write code, and ship it. So I decided to cut some corners.

To set the context...

- What I'm building is a personal budgeting app
- I build it as a Laravel API and a Next.js app, though this post focuses on the API part

I began my adventure by building a basic transaction tracking feature. So, all I implemented was mostly just <abbr title="Create, read, update, delete">CRUD</abbr> functionality for a few entities.

### First steps: Basics of transactions

I have started by creating the Eloquent model, and writing a couple tests as a start.

<details markdown="1">
<summary>Click to see the tests</summary>

```php
class AddingTransactionsTest extends TestCase
{
    // ...
    
    /** @test */
    public function user_can_create_expense_transaction(): void
    {
        $user = User::factory()->create();
        
        /** @var Account $account */
        $account = Account::factory()->recycle($user)->create();

        $this->actingAs($user)
            ->postJson('/v1/transactions', [
                'account_id' => $account->id,
                'amount' => -1000,
                'transaction_date' => today()->addDays(-1)->format('Y-m-d'),
            ])
            ->assertCreated();

        $this->assertDatabaseHas(Transaction::class, [
            'account_id' => $account->id,
            'amount' => -1000,
        ]);
    }
}
```
</details>

The implementation:

```php
// File: app/Http/Controllers/TransactionController.php

class TransactionController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'account_id' => [
                'required',
                'uuid',
                Rule::exists(Account::class, 'id')->where('user_id', $request->user())
            ],
            'amount' => ['required', 'numeric'],
            'transaction_date' => ['required', 'date:Y-m-d'],
        ]);

        $transaction = Transaction::create($data);

        return response()->json(['data' => $transaction], 201);
    }
}
```

Although I didn't include them in the snippets, I built all other CRUD operations in the same controller.

I know what you're thinking. That's a dead simple feature, of course it's fine to have all of that in the controller. This approach will hold up to pretty high complexities, but talk is cheap, so let's introduce some slight complexity to demonstrate.

### The intricacies

I need to recalculate account balances whenever a transaction is created, updated, or deleted. Since all of these actions can only be done in the controller so far, I opt to keep the logic within the controller.


<details markdown="1">
<summary>Click to see the tests</summary>

```php
// File: tests/Feature/Accounts/AccountBalancesTest.php

class AccountBalancesTest extends TestCase
{
    /** @test */
    public function past_transactions_affect_account_balance(): void
    {
        $account = Account::factory()->create();

        $postData = Transaction::factory()
            ->recycle($account)
            ->makeOne(['transaction_date' => today()->addDays(-5)->format('Y-m-d')])
            ->only([
                'account_id',
                'amount',
                'transaction_date',
            ]);

        $this->actingAs($account->user)
            ->postJson('v1/transactions', $postData)
            ->assertSuccessful()

        $account->refresh();

        // This is a custom assertion method I made that effectively runs
        // `->assertEquals($one->getAmount(), $two->getAmount())`.
        $this->assertMoneyEquals(
            $transactions->sum('amount'),
            $account->balance,
        );
    }
}
```
</details>


```php
// File: app/Http/Controllers/TransactionController.php

class TransactionController extends Controller
{
    public function store(Request $request)
    {
        // ...

        $transaction = Transaction::create($data);

        $transaction->account->update([
            'balance' => $transaction->account->transactions()->sum('amount'),
        ]);

        // ...
    }
}
```

**That's it!** That's the whole implementation.

<details markdown="1">
<summary>
I copy-pasted the code to the controller methods `update` and `delete` as well. Click to check their implementations. There is slight differences.
</summary>

```php
// File: app/Http/Controllers/TransactionController.php

class TransactionController extends Controller
{
    // ...
    
    public function update(Request $request)
    {
        $data = $request->validate([
            'account_id' => [
                'required',
                'uuid',
                Rule::exists(Account::class, 'id')->where('user_id', $request->user())
            ],
            'amount' => ['required', 'numeric'],
            'transaction_date' => ['required', 'date:Y-m-d'],
        ]);

        $transaction->update($data);

        /*
         * There is a slight difference in this method. The user can change
         * accounts, and when that happens we need to update both. Though it's
         * still the same code, just applied to two accounts instead of one.
         */
        if ($transaction->wasChanged('account_id')) {
            $oldAccount = Account::find($transaction->getOriginal('account_id'));

            $oldAccount->update([
                'balance' => $oldAccount->transactions()->sum('amount'),
            ]);
        }

        $transaction->account->update([
            'balance' => $transaction->account->transactions()->sum('amount'),
        ]);

        // ...
    }

    public function delete(Request $request)
    {
        $account = $transaction->account;

        $transaction->delete();

        $account->update([
            'balance' => $account->transactions()->sum('amount'),
        ]);

        // ...
    }
}
```
</details>

A point can be made here that the account balance recalculation should happen on a service class or a job class, which wouldn't be the worst idea, but I have a better one!

### The optimisation: Events and listeners

Semantically speaking, when a user asks the API to create a transaction, we can say that updating the account balance is a side-effect. That's because user's request does not explicitly say anything about what happens to accounts. So I want to treat this functionality as a side-effect, and to me that means decoupling the two operations. I chose to do this via events and listeners.

#### Step 1: Create the events

```php
// File: app/Events/TransactionCreated.php
// File: app/Events/TransactionUpdated.php
// File: app/Events/TransactionDeleted.php


class TransactionCreated
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Transaction $transaction,
    ) {
    }
}

class TransactionUpdated
{
    use Dispatchable, SerializesModels;

    /** @var Collection<string, { old: string, new: string }> */
    public Collection $changes;

    public function __construct(
        public Transaction $transaction,
    ) {
        /*
         * Have to record the changes in a separate dictionary, because if this
         * event's listeners execute asynchronously, `->getOriginal()` method
         * on the model will no longer contain what was changed.
         */
        $this->changes = /* implementation detail here */;
    }
}

class TransactionDeleted
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Transaction $transaction,
    ) {
    }
}
```

<details markdown="1">
<summary>And configure model to fire them.</summary>

```php
// File: app/Models/Transaction.php

class Transaction extends Model
{
    protected $dispatchesEvents = [
        'created' => TransactionCreated::class,
        'updated' => TransactionUpdated::class,
        'deleted' => TransactionDeleted::class,
    ];

    // ...
}
```
</details>

#### Step 2: Create the listener

```php
class UpdateAccountBalance implements ShouldQueue
{
    public function handle(TransactionCreated | TransactionUpdated | TransactionDeleted $event): void
    {
        if ($event instanceof TransactionUpdated && $event->hasAccountChanged()) {
            $oldAccount = Account::find($event->changes['account_id']['old']);

            $oldAccount->update([
                'balance' => $oldAccount->transactions()->sum('amount'),
            ]);
        }

        $account = $event->transaction->account;

        $account->update([
            'balance' => $account->transactions()->sum('amount'),
        ]);
    }
}
```

<details markdown="1">
<summary>And attach the listener to the events.</summary>

```php
// File: app/Providers/EventServiceProvider.php

class EventServiceProvider extends ServiceProvider
{
    protected $listen = [
        TransactionCreated::class => [
            UpdateAccountBalance::class,
        ],

        TransactionUpdated::class => [
            UpdateAccountBalance::class,
        ],

        TransactionDeleted::class => [
            UpdateAccountBalance::class,
        ],
    ];
}
```
</details>

#### Step 3: Clean up the controller

With the events and listeners ready, we no longer need the extra bits in the controller methods.

<details markdown="1">
<summary>
Click to see the full, cleaned up controller code.
</summary>

```php
// File: app/Http/Controllers/TransactionController.php

class TransactionController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'account_id' => [
                'required',
                'uuid',
                Rule::exists(Account::class, 'id')->where('user_id', $request->user())
            ],
            'amount' => ['required', 'numeric'],
            'transaction_date' => ['required', 'date:Y-m-d'],
        ]);

        $transaction = Transaction::create($data);

        return response()->json(['data' => $transaction], 201);
    }
    
    public function update(Request $request)
    {
        $data = $request->validate([
            'account_id' => [
                'required',
                'uuid',
                Rule::exists(Account::class, 'id')->where('user_id', $request->user())
            ],
            'amount' => ['required', 'numeric'],
            'transaction_date' => ['required', 'date:Y-m-d'],
        ]);

        $transaction->update($data);

        return response()->json(['data' => $transaction]);
    }

    public function delete(Request $request)
    {
        $account = $transaction->account;

        $transaction->delete();

        $account->update([
            'balance' => $account->transactions()->sum('amount'),
        ]);

        return response(null, 204);
    }
}
```

Pretty clean, eh?
</details>

#### Step 4, optional: More organisation

Now that I have decoupled account balance update from transaction API endpoints, I can also decouple its test from the API calls as well.

So instead of this:

```php
// File: tests/Feature/Accounts/AccountBalancesTest.php

class AccountBalancesTest extends TestCase
{
    /** @test */
    public function past_transactions_affect_account_balance(): void
    {
        $account = Account::factory()->create();

        $postData = Transaction::factory()
            ->recycle($account)
            ->makeOne(['transaction_date' => today()->addDays(-5)->format('Y-m-d')])
            ->only([
                'account_id',
                'amount',
                'transaction_date',
            ]);

        $this->actingAs($account->user)
            ->postJson('v1/transactions', $postData)
            ->assertSuccessful()

        $account->refresh();

        // This is a custom assertion method I made that effectively runs
        // `->assertEquals($one->getAmount(), $two->getAmount())`.
        $this->assertMoneyEquals(
            $transactions->sum('amount'),
            $account->balance,
        );
    }
}
```

... I can have this as the test:

```php
// File: tests/Feature/Accounts/AccountBalancesTest.php

class AccountBalancesTest extends TestCase
{
    /** @test */
    public function past_transactions_affect_account_balance(): void
    {
        $account = Account::factory()->create();

        $transaction = Transaction::factory()->recycle($account)->create([
            'transaction_date' => today()->addDays(-5)->format('Y-m-d'),
        ]);

        $account->refresh();

        $this->assertMoneyEquals(
            $transaction->amount,
            $account->balance,
        );
    }
}
```

The result is:

- Test methods are slimmer.
- More resilient test:
    - It will still work even if the endpoint changes.
- More resilient implementation:
    - Everything will still work if transactions are updated from another place.
    - The account balance recalculation is automatic and implicit. If you implement transaction creation on another endpoint or an Artisan command, you don't need to remember to trigger the recalculation.

## Wrap up

What my theory proposes here isn't that we should cram everything into controllers and leave them there forever. That is not maintainable for most real world products. But the point is that adhering to DRY convention religiously and trying to optimise everything from the get go is also rarely effective.

I'm proposing that we should _start by_ cramming things into a controller first, make the tests pass, and then reorganise the code where it's obviously meaningful to do so. You can choose to reorganise immediately, or you can come back to it later if the need arises at any future point.

Although the example I have shown in this article is somewhat simple, the approach is not limited to any level of complexity. The actual implementations in this app (even the specific feature I wrote about) have a lot more complexity and detail, and so far I haven't seen any downsides to my approach. As a counterargument I must acknowledge that this is a barely year-old app that I've only been dogfooding for a couple months.

## Acknowledgements

This is *not* a novel idea. [Martin Fowler wrote about YAGNI](https://martinfowler.com/bliki/Yagni.html) 9 years ago, [Kent C. Dodds wrote about AHA](https://kentcdodds.com/blog/aha-programming) 4 years ago, [KISS principle](https://en.wikipedia.org/wiki/KISS_principle) has been around in software development circles for a long time, [MVP](https://en.wikipedia.org/wiki/Minimum_viable_product) is a widely known product development strategy, and there are a few other acronyms out there that are more or less in line with my approach.
