# Crypto Transaction Codes — Best Practices

Mini-Core provides transaction codes for crypto operations but does **not** enforce double-sided accounting. It is the caller's responsibility to insert the correct transactions on each account involved in a crypto exchange.

---

## Crypto Transaction Codes

### Credits (40001–40099) — increase balance

| Code  | Description                   | Use on account |
|-------|-------------------------------|----------------|
| 40001 | CRYPTO TRANSFER RECEIVED      | Crypto account receiving an inbound transfer |
| 40002 | CRYPTO CONVERSION RECEIVED    | Crypto account receiving the output of a crypto-to-crypto conversion |
| 40003 | CRYPTO PURCHASE RECEIVED      | Crypto account receiving newly purchased crypto |
| 40004 | RECEIVED FROM EXTERNAL WALLET | Crypto account receiving from an external wallet |
| 40005 | CRYPTO SALE PROCEEDS          | Fiat account receiving proceeds from a crypto sale |
| 40006 | CURRENCY CONVERSION IN        | Any account receiving the target currency of a conversion (fiat or crypto) |

### Debits (50001–50099) — decrease balance

| Code  | Description                   | Use on account |
|-------|-------------------------------|----------------|
| 50001 | CRYPTO TRANSFER SENT          | Crypto account sending an outbound transfer |
| 50002 | CRYPTO CONVERSION SENT        | Crypto account giving up the input of a crypto-to-crypto conversion |
| 50003 | CRYPTO SALE                   | Crypto account being debited when crypto is sold |
| 50004 | SENT TO EXTERNAL WALLET       | Crypto account sending to an external wallet |
| 50005 | CRYPTO PURCHASE PAYMENT       | Fiat account being debited to pay for crypto |
| 50006 | CURRENCY CONVERSION OUT       | Any account giving up the source currency of a conversion (fiat or crypto) |

---

## Common Scenarios

### Buying crypto (fiat → crypto)

Two separate transactions must be inserted by the caller:

```
Account: fiat (e.g. USD)     code: 50005  CRYPTO PURCHASE PAYMENT   direction: DEBIT   status: POSTED
Account: crypto (e.g. ETH)   code: 40003  CRYPTO PURCHASE RECEIVED   direction: CREDIT  status: POSTED
```

The fiat account loses the purchase amount. The crypto account gains the equivalent amount of crypto.

---

### Selling crypto (crypto → fiat)

```
Account: crypto (e.g. ETH)   code: 50003  CRYPTO SALE          direction: DEBIT   status: POSTED
Account: fiat (e.g. USD)     code: 40005  CRYPTO SALE PROCEEDS  direction: CREDIT  status: POSTED
```

The crypto account loses the sold amount. The fiat account gains the proceeds.

---

### Transferring crypto between wallets

```
Account: crypto (sender)     code: 50004  SENT TO EXTERNAL WALLET      direction: DEBIT   status: POSTED
Account: crypto (receiver)   code: 40001  CRYPTO TRANSFER RECEIVED     direction: CREDIT  status: POSTED
```

If both accounts exist in Mini-Core, insert one transaction per account. If only one side is in Mini-Core, insert only that one.

---

### Converting crypto to crypto (e.g. ETH → SOL)

```
Account: ETH account         code: 50002  CRYPTO CONVERSION SENT       direction: DEBIT   status: POSTED
Account: SOL account         code: 40002  CRYPTO CONVERSION RECEIVED    direction: CREDIT  status: POSTED
```

---

### Converting any currency (e.g. USD → BRL, USD → ETH, ETH → USD)

Use the general-purpose conversion codes when crossing currency types (fiat↔fiat, fiat↔crypto):

```
Account: USD account         code: 50006  CURRENCY CONVERSION OUT      direction: DEBIT   status: POSTED
Account: BRL account         code: 40006  CURRENCY CONVERSION IN       direction: CREDIT  status: POSTED
```

For crypto-to-crypto you may use either `50002/40002` or `50006/40006` — prefer `50002/40002` when both sides are crypto to keep the intent explicit.

---

## Key Rules

- **Mini-Core does not link the two sides** — there is no built-in concept of a paired transaction. The caller must insert both and maintain any external reference (e.g. an exchange order ID in `json_payload`).
- **Amounts are independent** — the fiat amount and the crypto amount are in different units. Use `json_payload` to store the exchange rate, order ID, or any other metadata that links both sides.
- **Currency must match the account** — a transaction on a USD account must use a fiat code; a transaction on an ETH account must use a crypto code. The decimal precision is enforced by the `trg_validate_transaction_amount_decimals` trigger (USD: 2 places, USDC/USDT/EURC: 6, ETH/POL/SOL: 8).
- **Credits cannot be PENDING** — all crypto transactions should be inserted as `POSTED`. The no-PENDING-credits rule applies to all credit transactions regardless of currency.

---

## Example `json_payload` for traceability

```json
{
  "exchange_order_id": "ORD-20260305-8821",
  "exchange_rate": "3412.55",
  "rate_currency": "USD",
  "network": "Ethereum",
  "tx_hash": "0xabc123..."
}
```

Store the same `exchange_order_id` on both sides so the two transactions can be correlated later.
