# monsa

Ask before you buy.

monsa is a small budget helper that lives in your terminal. You tell it what
you want to buy, and it tells you if it fits the money you have left this
month. If you go ahead, it writes the purchase down for you.

## What it does

- **Answers "can I afford this?"** It knows your budget, what you already
  spent, how many days are left in the month, and how much a day that leaves.
- **Keeps the month's list.** Every purchase you confirm is saved, with the
  date and a short label.
- **Asks first.** Nothing is saved until you say yes.
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

Two inputs monsa handles itself:

| Input | What happens |
| --- | --- |
| `/reset` | Forgets your profile, after asking you to confirm |
| `exit` or `quit` | Closes monsa |

## Notes

- Nothing leaves your machine except the text you type, which goes to the
  Anthropic API so the agent can answer.
- monsa does not convert currencies. If your purchases are in one currency and
  your budget in another, it says so instead of guessing a rate.

## Development

```bash
npm test         # run the tests
npm run typecheck
```

MIT licensed.
