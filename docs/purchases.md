# Purchases — how it works

Short guide. What was added, and how to use it.

## What is new

Before, monsa could talk to you but it did not save anything you bought.

Now monsa does two things:

1. **It saves what you buy** to a file, one file per month.
2. **It tells you first if buying it is a good idea** — before you buy.

## How to use it

Tell monsa what you want to buy. **It thinks first, then asks.**

```
you:   i want to buy shoes 800
monsa: 1,200 left with 9 days to go. You're spending about 86 a day,
       so you need around 770 to finish the month. This leaves 400.
       You also bought 600 of clothes already. I'd wait.
       Save shoes, 800 MAD? (y/n)
you:   y
monsa: Recorded. 400 MAD left.
```

monsa tells you what it thinks. **You still decide.** If you say `y`, it saves
it and says nothing more about it.

If monsa cannot tell if the thing is important, it asks you:

```
you:   i want to buy a laptop 4000
monsa: What is it for — work, or something else?
you:   work, mine broke
monsa: Then yes. That is a tool, not a want. It leaves you tight for
       9 days, but a broken work laptop costs you more.
       Save laptop, 4,000 MAD? (y/n)
```

**There is no fixed rule.** monsa does not always keep 20% or any number like
that. How much it wants you to keep back depends on what you are buying.
Medicine is not shoes.

You can also say you already bought something. It works the same way:

```
you:   i bought bread 12
monsa: Small, and you have room. Save bread, 12 MAD? (y/n)
```

**Nothing is saved until you type `y`.**

If you type `n`, nothing is saved.
If you type something else, like `maybe`, it means **no**. This is on purpose.
It is safer to save nothing than to save the wrong thing.

To remove a purchase, just ask:

```
you:   remove that coffee
monsa: Removed coffee, 30 MAD. Spent 0 of 4,000 MAD this month; 4,000 MAD left.
```

Remove does **not** ask you first. You already asked for it with your words.

## Where your money is saved

In your home folder, one file for each month:

```
~/.monsa/config.json     your name, budget, currency
~/.monsa/2026-09.json    what you bought in September 2026
~/.monsa/2026-10.json    October, made when you buy something
```

The files are normal JSON. You can open them and read them.

A new month makes a new file. Old months stay.

## What monsa knows now

Every time you send a message, monsa is told:

- your budget
- what you spent this month
- what is left
- **how fast you are spending** (money per day so far, and money per day you
  can still afford)
- the list of everything you bought

So you can ask *"what did I buy this month?"* or *"how much is left?"* and it
knows. It does not guess.

The first line when you open monsa also shows the real number now:

```
Hey Salah — 3,970 MAD left for September, 10 days to go.
```

## Two things to know

**1. There is already one purchase in your file.**

`tshirt, 400 MAD`, saved today at 14:19. I did not put it there and I did not
touch it. If it is yours, keep it. If not, ask monsa to remove it (id
`e6a08de2`).

**2. Changing your currency in the middle of a month.**

If you use `/reset` and pick a new currency, the old month file keeps the old
currency. Money in two currencies cannot be added together, and monsa has no
exchange rate.

So monsa will **refuse to save** a new purchase in that month. It tells you why.
This is on purpose. A wrong number is worse than no number.

To fix it: remove the old purchases, or wait for the next month.

Also: `/reset` deletes your profile but **keeps** your month files. So a new
profile still sees the old purchases. Tell me if you want this changed.

## Not done yet

Small things, nothing broken:

- Negative money shows as `$-430`, not `-$430`.
- The "different currencies" message is written in 4 places, with 4 slightly
  different wordings. It should be one.
- The three newest UI fixes have no automatic test. This project has no tool to
  test React screens. I checked them by reading the code and by running the
  real code end to end.

## Numbers

- 14 commits
- 92 tests, all passing
- 8 tasks, each one reviewed
- 5 rounds of fixes for real bugs found in review
