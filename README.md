# monsa

Ask before you buy.

monsa is a small budget helper that lives in your terminal. You tell it what
you want to buy, and it tells you if it fits the money you have left this
month. If you go ahead, it writes the purchase down for you.

## What it does

- **Answers "can I afford this?"** It knows your budget, what you already
  spent, how many days are left, and how much a day that leaves. It also
  compares how fast you are *actually* spending against how fast you still
  can, and says what it thinks before you buy.
- **Judges the thing, not just the number.** There is no fixed rule like
  "always keep 20%". How much it wants you to hold back depends on what you
  are buying — medicine is not shoes.
- **Asks when it cannot tell.** If a word could go either way, like "laptop",
  it asks what it is for instead of guessing.
- **Keeps the month's list.** Every purchase you confirm is saved, with the
  date and a short label.
- **Asks first.** Nothing is saved until you say yes. Anything unclear counts
  as a no.
- **Can undo.** Tell it to remove a purchase and it takes it back off the list.

## Install

You need Node 22 or newer and an Anthropic API key.

```bash
npm install
cp .env.example .env    # then put your key in .env
npm run build
npm start
```

To run it while changing the code, use `npm run dev`.

## First run

monsa asks three questions once: your name, how much you want to spend each
month, and the currency you spend in. It remembers the answers in
`~/.monsa/config.json`. Your purchases go next to it, one file per month.

## Talking to it

Just type in plain words:

```
> can I buy headphones for 120?
> I paid 40 for petrol
> how much is left?
> remove the petrol one
```

It answers before it writes anything down:

```
> i want to buy shoes 800

1,200 left with 9 days to go. You are spending about 86 a day, so you
need roughly 770 to finish the month. This leaves 400, and you already
bought 600 of clothes. I would wait.

Save shoes, 800 MAD? (y/n)
```

You decide. Say `y` and it is saved; say anything else and it is not.

Two inputs monsa handles itself:

| Input | What happens |
| --- | --- |
| `/reset` | Forgets your profile, after asking you to confirm |
| `exit` or `quit` | Closes monsa |

## Notes

- Nothing leaves your machine except the text you type, which goes to the
  Anthropic API so the agent can answer.
- monsa does not convert currencies. If your purchases are in one currency and
  your budget in another, it says so instead of guessing a rate, and it refuses
  to record a new purchase into a month kept in a different currency.
- The advice is a judgement, not a calculation. The arithmetic it quotes is
  computed in code and is reliable; what it makes of that arithmetic is the
  model's opinion, and yours overrules it.

## Development

```bash
npm test         # run the tests
npm run typecheck
```

MIT licensed.
