# TEAM ELITE PH TSHIRT

Sales tally for Team Elite PH t-shirt orders.

Open `index.html` in a browser, or serve the folder. There is no build step and no dependencies.

## Prices

Prices are in Philippine pesos.

| Size | Price |
| --- | --- |
| S, M, L, XL | ₱399 |
| 2XL, 3XL, 4XL | ₱449 |

White and blue are the same price. The price comes from the size alone.

## The page has three sections

**1 · Name & orders** — enter the name and the shirts.

- **NAME** for the person
- **COLOR**, white or blue
- **SIZE**, S through 4XL. The price for that size shows under the menu
- **QTY**
- **ADD** at the bottom of the section. Press it once per shirt

One person can order several sizes of the same colour, so `white 2-S`, `blue 4-XL`, `white 5-4XL`, `white 2-2XL` is four separate ADD presses and lands in four separate cells.

**2 · Cart** — the shirts land here.

Every ADD press drops a line into the cart. Picking the same colour and size again tops up that line rather than duplicating it. A line quantity can be changed on the spot, and setting it to 0 or pressing its × drops the line. When the order is final, press **ADD TO LIST**: the name and the whole cart become one row in section 3, and the cart empties for the next person.

The cart is only memory. Nothing is kept until **ADD TO LIST**, and an order with no name or no shirts is refused.

**3 · List** — the tally.

One row per person, with:

- seven **WHITE** size columns, S through 4XL
- seven **BLUE** size columns, S through 4XL
- **PRICE** for the row
- **PAID/UNPAID**
- **EDIT**

The footer under the sheet adds up every size column, so the white M total and the blue 4XL total are both visible without scrolling. At the bottom of the section the **Tally** counts the people, the number of shirts, the paid and unpaid money with how many people sit behind each, and a count of every colour and size.

**The sheet is read only.** Quantities cannot be changed from the grid. Press **EDIT** on a row and its fourteen cells turn into quantity boxes, along with the name, then press **DONE** to lock the row again. While editing:

- a quantity of 0 clears that cell
- a quantity in a cell that was empty adds that shirt, so corrections do not need a new order
- only one row is editable at a time
- Escape finishes editing

**PAID** and **UNPAID** can be tapped at any time, with or without EDIT. The × at the end of a row removes the person, and offers Undo right after.

Search, the filter chips, and the sort menu all work on the list. The counts always cover the whole list, even when a filter hides some rows.

## List limits

- Up to 300 people
- Up to 99 shirts per size cell
- The phone layout turns each person into a card: name, price, payment and EDIT on the first line, then the fourteen size cells as two rows of seven

Tap **Save list** to store the list on this website (in this browser). It is not uploaded. Use **Backup** if you need a copy, and **Export CSV** or **Copy summary** to share the count.

## Saved data

The list is stored as one person per row, where each person holds a list of items and each item is a color, a size, and a quantity:

```json
{
  "id": "…",
  "name": "Ana Reyes",
  "items": [
    { "color": "white", "size": "M", "qty": 2 },
    { "color": "blue", "size": "4XL", "qty": 1 }
  ],
  "paid": false,
  "createdAt": 0
}
```

A list saved by an earlier version of this page is converted when the page loads: the old white size, blue size, and extra 3XL/4XL columns become items. The old extra columns carried no color, so they are read as **white**. Anything saved from here on uses the shape above, and a **Backup** from an earlier version still restores.

## Tests

```
node tally.test.js
```

Covers the price list, item merging, grid math, row totals, and the conversion of older saved shapes.
