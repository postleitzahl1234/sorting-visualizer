/* =====================================================================
 * algo-info.js  –  English descriptions, complexity data and trivia
 * ---------------------------------------------------------------------
 * cat         category id (names are in i18n.js)
 * comparison  false for algorithms that do not sort by comparing
 *             (the "Killer" input is only offered for comparison sorts)
 * tip.try     { input, size, view } applied by the "Try it" button
 * German texts live in algo-info-de.js.
 * ===================================================================== */
(function (global) {
  'use strict';
  const CATEGORIES = ["exchange","selection","insertion","merge","quick","distribution","network","joke"];
  const INFO = [
    {
      "id": "bubble",
      "name": "Bubble Sort",
      "cat": "exchange",
      "best": "n",
      "avg": "n²",
      "worst": "n²",
      "mem": "1",
      "stable": true,
      "comparison": true,
      "summary": "Repeatedly swaps neighbours that are in the wrong order until nothing moves.",
      "how": "Bubble sort walks through the array comparing each pair of neighbours and swapping them when the left one is bigger. After the first pass the largest value has \"bubbled up\" to the end, after the second pass the second largest, and so on. The sorted part grows from the right.",
      "steps": [
        "Compare a[i] and a[i+1] for every i in the unsorted part.",
        "Swap them if they are out of order.",
        "The biggest element is now at the end, so shrink the unsorted part by one.",
        "Stop early if a whole pass made no swaps."
      ],
      "trivia": [
        "The name \"bubble sort\" appeared in print around 1962 (Kenneth Iverson). Before that it was known as \"sorting by exchange\".",
        "Donald Knuth: \"the bubble sort seems to have nothing to recommend it, except a catchy name and the fact that it leads to some interesting theoretical problems.\"",
        "In 2007 Eric Schmidt jokingly asked Barack Obama how to sort a million 32-bit integers. Obama answered: \"I think the bubble sort would be the wrong way to go.\"",
        "Small values near the end (\"turtles\") move left by only one position per pass. That is why it is so slow."
      ],
      "tip": {
        "text": "Nearly-sorted input finishes after only a few passes thanks to the early exit.",
        "try": {
          "input": "nearly",
          "size": 64
        }
      }
    },
    {
      "id": "cocktail",
      "name": "Cocktail Shaker Sort",
      "cat": "exchange",
      "best": "n",
      "avg": "n²",
      "worst": "n²",
      "mem": "1",
      "stable": true,
      "comparison": true,
      "summary": "Bubble sort that alternates direction on every pass.",
      "how": "A bidirectional bubble sort. One pass goes left→right and carries the largest value to the end. The next goes right→left and carries the smallest value to the front. This fixes bubble sort's \"turtle\" problem, where small values stuck at the end crawl only one step per pass. The algorithm also remembers where the last swap happened, so it can skip the parts that are already sorted.",
      "steps": [
        "Forward pass: bubble the largest element to the right end.",
        "Backward pass: bubble the smallest element to the left end.",
        "Narrow the range to the positions of the last swaps.",
        "Repeat until a pass makes no swaps."
      ],
      "trivia": [
        "Also called bidirectional bubble sort, shaker sort, ripple sort, shuffle sort and shuttle sort.",
        "Knuth discusses it in The Art of Computer Programming, Vol. 3, and concludes that it is only a marginal improvement over bubble sort.",
        "The name comes from the back-and-forth motion, like shaking a cocktail shaker."
      ],
      "tip": {
        "text": "Race it against Bubble Sort on \"Organ pipe\" input to see how much the backward pass helps.",
        "try": {
          "input": "organ",
          "size": 64
        }
      }
    },
    {
      "id": "oddeven",
      "name": "Odd-Even (Brick) Sort",
      "cat": "exchange",
      "best": "n",
      "avg": "n²",
      "worst": "n²",
      "mem": "1",
      "stable": true,
      "comparison": true,
      "summary": "Alternately compares all odd-indexed pairs, then all even-indexed pairs.",
      "how": "Instead of one long sweep, each round has two phases. First compare-and-swap the pairs (1,2), (3,4), (5,6)… and then the pairs (0,1), (2,3), (4,5)…. The comparisons inside one phase do not overlap, so they could all run at the same time on parallel hardware. The pattern of comparisons looks like the rows of a brick wall.",
      "steps": [
        "Odd phase: compare/swap every pair (i, i+1) with odd i.",
        "Even phase: compare/swap every pair (i, i+1) with even i.",
        "Repeat until a full round makes no swaps."
      ],
      "trivia": [
        "Designed for parallel processors that can only talk to their neighbours. With n processors it sorts in at most n rounds.",
        "Nico Habermann described it in 1972 as \"parallel neighbor-sort\".",
        "Because of the brick-wall pattern it is also called brick sort."
      ],
      "tip": {
        "text": "In Dots view you can see the whole array shift a little bit every round.",
        "try": {
          "view": "dots",
          "size": 128
        }
      }
    },
    {
      "id": "comb",
      "name": "Comb Sort",
      "cat": "exchange",
      "best": "n log n",
      "avg": "n²/2ᵖ",
      "worst": "n²",
      "mem": "1",
      "stable": false,
      "comparison": true,
      "summary": "Bubble sort with a shrinking gap that kills \"turtles\" early.",
      "how": "Bubble sort only compares neighbours, so small values at the end (\"turtles\") move very slowly. Comb sort first compares elements that are far apart. The gap starts at n/1.3 and is divided by 1.3 after every pass. Far-away turtles get thrown forward in big jumps. When the gap reaches 1 it becomes a plain bubble sort, but by then the data is nearly sorted.",
      "steps": [
        "gap = n.",
        "gap = floor(gap / 1.3) (but at least 1).",
        "Compare/swap every pair (i, i+gap).",
        "Repeat until gap is 1 and a pass made no swaps."
      ],
      "trivia": [
        "Invented by Włodzimierz Dobosiewicz and Artur Borowy in 1980, and rediscovered by Stephen Lacey and Richard Box, who popularised it in Byte Magazine in 1991.",
        "The shrink factor 1.3 was found by experimenting on over 200,000 random lists.",
        "\"Combsort11\" replaces gaps of 9 and 10 by 11, which avoids some slow cases.",
        "Comb sort is to bubble sort roughly what Shell sort is to insertion sort."
      ],
      "tip": {
        "text": "Race it against Bubble Sort, same array, very different speed.",
        "try": {
          "input": "shuffled",
          "size": 256
        }
      }
    },
    {
      "id": "gnome",
      "name": "Gnome Sort",
      "cat": "exchange",
      "best": "n",
      "avg": "n²",
      "worst": "n²",
      "mem": "1",
      "stable": true,
      "comparison": true,
      "summary": "A garden gnome walks forward while pots are in order and steps back after each swap.",
      "how": "Gnome sort uses a single position (the purple marker). If the element at that position is in order with the one to its left, the gnome steps forward. Otherwise it swaps them and steps back. It does the same work as insertion sort, but with swaps instead of shifts and only one loop.",
      "steps": [
        "Start at position 0.",
        "If at the start or a[i-1] ≤ a[i], step forward (i++).",
        "Otherwise swap a[i-1] and a[i] and step back (i--).",
        "Done when the gnome walks off the right end."
      ],
      "trivia": [
        "First proposed in 2000 by Hamid Sarbazi-Azad as \"stupid sort\". Dick Grune later described it and gave it the name gnome sort.",
        "Grune's story: a Dutch garden gnome sorts a row of flower pots. It looks at the pot next to it and the previous one. If they are in order it steps forward, otherwise it swaps them and steps back.",
        "It is probably the only sorting algorithm with a single loop and no nested loop."
      ],
      "tip": {
        "text": "Watch the purple marker: it is the gnome walking back and forth.",
        "try": {
          "input": "shuffled",
          "size": 48
        }
      }
    },
    {
      "id": "circle",
      "name": "Circle Sort",
      "cat": "exchange",
      "best": "n log n",
      "avg": "≈ n log² n",
      "worst": "unproven",
      "mem": "log n",
      "stable": false,
      "comparison": true,
      "summary": "Compares elements mirrored around the centre, then recurses on both halves.",
      "how": "Compare the first element with the last, the second with the second-to-last and so on towards the middle, swapping pairs that are out of order. Then do the same on the left half and on the right half, recursively. One full round is done when all levels of recursion have finished. Rounds repeat until one round makes no swaps.",
      "steps": [
        "Compare/swap a[lo+k] with a[hi-k] moving inwards.",
        "Recurse on the left half and on the right half.",
        "Repeat whole rounds until no swap happens."
      ],
      "trivia": [
        "A little-known hobbyist algorithm, mostly known from Rosetta Code and sorting visualisations. No classic paper introduced it.",
        "If you draw the comparisons as arcs, you get nested circles. That is where the name comes from.",
        "Its exact worst-case running time has never been properly analysed."
      ],
      "tip": {
        "text": "Try the Disc view. The mirrored comparisons look great there.",
        "try": {
          "view": "disc",
          "size": 256
        }
      }
    },
    {
      "id": "selection",
      "name": "Selection Sort",
      "cat": "selection",
      "best": "n²",
      "avg": "n²",
      "worst": "n²",
      "mem": "1",
      "stable": false,
      "comparison": true,
      "summary": "Finds the minimum of the unsorted part and swaps it to the front.",
      "how": "Scan the unsorted part to find the smallest element (the purple marker follows the current minimum). Then swap it with the first unsorted position. The sorted prefix grows by one element per pass. It always does exactly n(n−1)/2 comparisons, even on sorted input.",
      "steps": [
        "Scan the unsorted part and remember the index of the minimum.",
        "Swap the minimum with the first unsorted element.",
        "Move the boundary one step to the right and repeat."
      ],
      "trivia": [
        "It uses at most n−1 swaps. That is good when writing is much more expensive than reading, as on flash memory or EEPROM.",
        "Its running time does not depend on the input at all: sorted, reversed and random arrays all need the same number of comparisons.",
        "Heap sort is basically selection sort with a much faster way (a heap) to find the next element."
      ],
      "tip": {
        "text": "Watch the \"swaps\" counter: it never goes above n−1.",
        "try": {
          "input": "shuffled",
          "size": 64
        }
      }
    },
    {
      "id": "doubleselection",
      "name": "Double Selection Sort",
      "cat": "selection",
      "best": "n²",
      "avg": "n²",
      "worst": "n²",
      "mem": "1",
      "stable": false,
      "comparison": true,
      "summary": "Finds both the minimum and the maximum in every pass.",
      "how": "A variant of selection sort that finds the minimum and the maximum of the unsorted middle part in one scan (both shown as purple markers). The minimum is swapped to the left end and the maximum to the right end. So the unsorted part shrinks from both sides and only half as many passes are needed.",
      "steps": [
        "Scan [lo, hi], tracking the index of both the minimum and the maximum.",
        "Swap the minimum to lo, then the maximum to hi. Watch out if the maximum was at lo!",
        "lo++, hi--, repeat."
      ],
      "trivia": [
        "It needs half the passes, but each pass does two comparisons per element. So the total number of comparisons stays about the same.",
        "The special case \"the maximum was at position lo\" is a classic source of bugs in this algorithm.",
        "Also called cocktail selection sort or bidirectional selection sort."
      ],
      "tip": {
        "text": "Race it against Selection Sort and compare the \"comparisons\" counters.",
        "try": {
          "input": "shuffled",
          "size": 96
        }
      }
    },
    {
      "id": "cycle",
      "name": "Cycle Sort",
      "cat": "selection",
      "best": "n²",
      "avg": "n²",
      "worst": "n²",
      "mem": "1",
      "stable": false,
      "comparison": true,
      "summary": "Writes every element directly to its final position, never more than once.",
      "how": "A permutation can be split into cycles. Cycle sort takes an element, counts how many elements are smaller than it to find where it belongs, and puts it there. The element that was there is picked up next, and so on until the cycle closes. Then the next cycle starts. Every element is written at most once. The helper strip shows the element currently in your hand.",
      "steps": [
        "Pick up item = a[start].",
        "Count the elements smaller than item. That count is its final position.",
        "Skip over duplicates, place the item, pick up the element that was there.",
        "Continue until the cycle returns to start, then go to the next start."
      ],
      "trivia": [
        "It is optimal in the number of writes to the array. Useful on memory like EEPROM or flash, where every write wears the chip out.",
        "Described by B. K. Haddon in 1990.",
        "Elements that are already in the right place are never written at all."
      ],
      "tip": {
        "text": "Watch the \"writes\" counter: it never goes above n.",
        "try": {
          "input": "shuffled",
          "size": 64
        }
      }
    },
    {
      "id": "pancake",
      "name": "Pancake Sort",
      "cat": "selection",
      "best": "n²",
      "avg": "n²",
      "worst": "n²",
      "mem": "1",
      "stable": false,
      "comparison": true,
      "summary": "Sorts using only one move: flipping a prefix of the stack.",
      "how": "Imagine a stack of pancakes and a spatula. The only allowed move is to slide the spatula under some pancake and flip everything above it. To sort, find the largest unsorted pancake, flip it to the top, then flip the whole unsorted stack so it lands at the bottom. Repeat with a smaller stack. Each flip shows up as a series of swaps.",
      "steps": [
        "Find the maximum in the unsorted prefix.",
        "Flip the prefix that ends at the maximum. The maximum is now at the front.",
        "Flip the whole unsorted prefix. The maximum is now at its final place.",
        "Shrink the prefix and repeat."
      ],
      "trivia": [
        "Bill Gates's only academic paper, written with Christos Papadimitriou in 1979, was about pancake sorting. It gave an upper bound of (5n+5)/3 flips.",
        "David X. Cohen, later a writer for Futurama, co-wrote a paper on the \"burnt pancake problem\" in 1995.",
        "Finding the smallest number of flips for a given stack is NP-hard (proved in 2011)."
      ],
      "tip": {
        "text": "The Disparity view shows the flips nicely.",
        "try": {
          "view": "disparity",
          "size": 128
        }
      }
    },
    {
      "id": "heap",
      "name": "Heap Sort",
      "cat": "selection",
      "best": "n log n",
      "avg": "n log n",
      "worst": "n log n",
      "mem": "1",
      "stable": false,
      "comparison": true,
      "summary": "Builds a max-heap, then repeatedly moves the root to the end.",
      "how": "First the array is turned into a binary max-heap: element i has children 2i+1 and 2i+2, and every parent is ≥ its children. The maximum is then at the root. Swap it with the last element of the heap, shrink the heap by one and \"sift down\" the new root to restore the heap property. Repeat until the heap is empty. In the first phase you can see a rough \"pyramid\" form.",
      "steps": [
        "Heapify: sift down every internal node from the bottom up.",
        "Swap the root (maximum) with the last heap element.",
        "Shrink the heap by one and sift the new root down.",
        "Repeat until one element is left."
      ],
      "trivia": [
        "Invented by J. W. J. Williams in 1964, who invented the binary heap for it. Robert Floyd improved the heap construction the same year.",
        "Guaranteed O(n log n) with O(1) extra memory. That is why introsort falls back to it when quicksort degenerates.",
        "In practice it is often slower than quicksort because its jumps around the array are unfriendly to CPU caches."
      ],
      "tip": {
        "text": "In Bars view you can see the heap shape (big values at the front) during the first phase.",
        "try": {
          "input": "shuffled",
          "size": 256,
          "view": "bars"
        }
      }
    },
    {
      "id": "smooth",
      "name": "Smoothsort",
      "cat": "selection",
      "best": "n",
      "avg": "n log n",
      "worst": "n log n",
      "mem": "1",
      "stable": false,
      "comparison": true,
      "summary": "Heap sort with Leonardo heaps, close to linear time on almost sorted data.",
      "how": "Like heap sort, Smoothsort first builds a heap and then repeatedly takes out the maximum. Instead of one binary heap it keeps a row of heaps whose sizes are Leonardo numbers (1, 1, 3, 5, 9, 15, 25, …). Their roots increase from left to right, so the largest element is always the rightmost root, which is already at the end of the unsorted part. On nearly sorted input very little has to move, so the running time approaches O(n).",
      "steps": [
        "Add the elements one by one, joining the two last heaps whenever their sizes are neighbouring Leonardo numbers.",
        "Rectify: move the new root left past larger roots, then sift it down.",
        "Take the rightmost root (the maximum) and split its heap into its two subheaps.",
        "Rectify both subheaps and repeat."
      ],
      "trivia": [
        "Invented by Edsger W. Dijkstra in 1981 (note EWD796a).",
        "Leonardo numbers follow L(k) = L(k−1) + L(k−2) + 1, a close relative of the Fibonacci numbers.",
        "It is famously hard to implement correctly and is rarely used in practice, partly because it is not cache-friendly."
      ],
      "tip": {
        "text": "Nearly sorted input: far fewer steps than heap sort.",
        "try": {
          "input": "nearly",
          "size": 256
        }
      }
    },
    {
      "id": "tournament",
      "name": "Tournament Sort",
      "cat": "selection",
      "best": "n log n",
      "avg": "n log n",
      "worst": "n log n",
      "mem": "n",
      "stable": true,
      "comparison": true,
      "summary": "A knockout tournament: the winner (the smallest) is removed and only its path is replayed.",
      "how": "All elements become the leaves of a binary tree. Each inner node holds the winner (the smaller value) of the match between its two children, so the root holds the overall minimum. The root is written to the output, its leaf is replaced by +∞, and only the matches on the path from that leaf to the root are replayed: log₂ n comparisons per element. The helper strip shows the tree in array form (root at the left).",
      "steps": [
        "Copy the elements into the leaves (padding with +∞).",
        "Fill every inner node with the smaller of its two children.",
        "Output the root, replace its leaf with +∞.",
        "Replay the matches on that path and repeat."
      ],
      "trivia": [
        "Knockout tournaments show why the best-but-one player is not necessarily the one who lost the final: they only lost to the winner. Replaying the winner's path finds them with just log₂ n extra matches.",
        "Winner trees and loser trees are used in external sorting to merge many sorted runs at once (k-way merge).",
        "Ties go to the left child, which makes this version stable."
      ],
      "tip": {
        "text": "Watch the helper strip: the root (far left) always holds the next winner.",
        "try": {
          "input": "shuffled",
          "size": 64
        }
      }
    },
    {
      "id": "insertion",
      "name": "Insertion Sort",
      "cat": "insertion",
      "best": "n",
      "avg": "n²",
      "worst": "n²",
      "mem": "1",
      "stable": true,
      "comparison": true,
      "summary": "Takes elements one by one and shifts them into place, like sorting a hand of cards.",
      "how": "The left part of the array is always sorted. Take the next element (the \"key\"), shift every larger element in the sorted part one position to the right and drop the key into the gap. While the elements shift you briefly see a duplicate value, because the key is \"in your hand\". The helper strip below the bars shows it.",
      "steps": [
        "key = a[i].",
        "While a[j] > key: move a[j] one step to the right, j--.",
        "Write key to a[j+1].",
        "i++ and repeat."
      ],
      "trivia": [
        "It is the way most people sort a hand of playing cards.",
        "On almost-sorted data it runs in close to linear time. That is why Timsort, introsort and pdqsort all use it for small pieces (usually < 16–64 elements).",
        "It is an \"online\" algorithm: it can sort data while the data is still arriving."
      ],
      "tip": {
        "text": "Try \"Nearly sorted\": almost linear time.",
        "try": {
          "input": "nearly",
          "size": 128
        }
      }
    },
    {
      "id": "binaryinsertion",
      "name": "Binary Insertion Sort",
      "cat": "insertion",
      "best": "n log n",
      "avg": "n²",
      "worst": "n²",
      "mem": "1",
      "stable": true,
      "comparison": true,
      "summary": "Insertion sort that finds the insert position with binary search.",
      "how": "Like insertion sort, but the right position for the key is found with a binary search in the sorted prefix. That needs only about log₂(i) comparisons instead of up to i. The elements still have to be shifted one by one, so the number of writes (and the total time) stays quadratic.",
      "steps": [
        "key = a[i] (purple marker).",
        "Binary-search the sorted prefix [0, i) for the first element > key.",
        "Shift the elements after it one place to the right.",
        "Insert the key."
      ],
      "trivia": [
        "Knuth credits John Mauchly (co-designer of ENIAC) with mentioning binary insertion in 1946, in the first published discussion of computer sorting.",
        "It pays off when comparisons are expensive, for example comparing long strings, and moving elements is cheap.",
        "Timsort uses binary insertion sort to extend short runs."
      ],
      "tip": {
        "text": "Race it against Insertion Sort: far fewer comparisons, the same number of writes.",
        "try": {
          "input": "shuffled",
          "size": 96
        }
      }
    },
    {
      "id": "shell",
      "name": "Shell Sort",
      "cat": "insertion",
      "best": "n log n",
      "avg": "≈ n^1.3",
      "worst": "gap-dependent",
      "mem": "1",
      "stable": false,
      "comparison": true,
      "summary": "Insertion sort on elements that are far apart, with the gap shrinking to 1.",
      "how": "Insertion sort is slow because elements move one step at a time. Shell sort first insertion-sorts elements that are a large gap apart. Big moves happen early, and the array becomes \"roughly sorted\". The gap then shrinks, and the last pass (gap 1) is an ordinary insertion sort on nearly sorted data, which is fast. This version uses Marcin Ciura's gap sequence 1, 4, 10, 23, 57, 132, 301, 701 (extended by ×2.25).",
      "steps": [
        "For each gap in the sequence, from large to small:",
        "Do an insertion sort where \"neighbour\" means \"gap positions away\".",
        "The final gap is 1, a plain insertion sort that is now fast."
      ],
      "trivia": [
        "Published by Donald Shell in 1959. With a good gap sequence it is much faster than O(n²) and still needs no extra memory.",
        "The exact complexity for the best gap sequences is still an open problem.",
        "Ciura's gap sequence (2001) was found by computer search and is still one of the best known.",
        "Small C libraries (e.g. uClibc) have used Shell sort to implement qsort(), because it needs no recursion and no extra memory."
      ],
      "tip": {
        "text": "Race it against Insertion Sort on 512 elements.",
        "try": {
          "input": "shuffled",
          "size": 512
        }
      }
    },
    {
      "id": "tree",
      "name": "Tree Sort",
      "cat": "insertion",
      "best": "n log n",
      "avg": "n log n",
      "worst": "n²",
      "mem": "n",
      "stable": true,
      "comparison": true,
      "summary": "Inserts everything into a binary search tree, then reads it back in order.",
      "how": "Every element is inserted into a binary search tree: walk down from the root, go left when the new value is smaller, otherwise right, and attach it as a new leaf. An in-order traversal (left subtree, node, right subtree) then visits the values in sorted order. Equal values go right, so the order of equal keys is kept. The helper strip shows the tree nodes in insertion order.",
      "steps": [
        "Insert each element: walk down comparing with each node.",
        "Attach it as a new leaf.",
        "Traverse in order and write every value back."
      ],
      "trivia": [
        "On already sorted input the tree becomes one long chain, which makes it O(n²). Try it!",
        "Self-balancing trees (AVL trees from 1962, red-black trees) prevent that and guarantee O(n log n).",
        "Iterating over a sorted container such as C++ std::map or Java's TreeMap is essentially a tree sort."
      ],
      "tip": {
        "text": "\"Already sorted\" input turns the tree into a chain: O(n²).",
        "try": {
          "input": "sorted",
          "size": 128
        }
      }
    },
    {
      "id": "fordjohnson",
      "name": "Ford–Johnson (Merge-Insertion)",
      "cat": "insertion",
      "best": "n log n",
      "avg": "n log n",
      "worst": "n log n",
      "mem": "n",
      "stable": false,
      "comparison": true,
      "summary": "Designed to need as few comparisons as possible.",
      "how": "Pair up the elements and compare each pair. The larger elements (\"bigs\") are sorted recursively and form a sorted chain. Then the smaller partners are inserted with binary search, each one searching only to the left of its big partner. The insertion order (3, 2, 5, 4, 11, 10, …, 6, …) comes from the Jacobsthal numbers and makes every binary search run on a chain whose length is just below a power of two, so no comparison is wasted. Here the elements stay in place while they are compared and are written back in sorted order at the end.",
      "steps": [
        "Compare pairs → (big, small).",
        "Sort the bigs recursively.",
        "Insert the smalls in Jacobsthal order with binary search.",
        "Write the elements back in chain order."
      ],
      "trivia": [
        "Published by Lester Ford Jr. and Selmer Johnson in 1959.",
        "For a long time it was believed to be optimal. In 1979 Glenn Manacher showed that it can be beaten for some sizes, but it is still very close to the theoretical minimum log₂(n!).",
        "Knuth discusses it in detail in The Art of Computer Programming, Vol. 3 (section 5.3.1)."
      ],
      "tip": {
        "text": "Race it against Merge Sort and compare the \"comparisons\" counters.",
        "try": {
          "input": "shuffled",
          "size": 256
        }
      }
    },
    {
      "id": "merge",
      "name": "Merge Sort (top-down)",
      "cat": "merge",
      "best": "n log n",
      "avg": "n log n",
      "worst": "n log n",
      "mem": "n",
      "stable": true,
      "comparison": true,
      "summary": "Split in half, sort both halves recursively, merge them.",
      "how": "Divide and conquer: split the array into two halves, sort each half recursively, then merge the two sorted halves. Merging copies the range to a buffer (the helper strip below) and repeatedly takes the smaller front element of the two halves. You can see the recursion as small sorted blocks joining into larger ones. This version skips the merge when the two halves are already in order.",
      "steps": [
        "If the range has ≤ 1 element, it is sorted.",
        "Sort the left half, sort the right half (recursively).",
        "Merge: copy to a buffer, then repeatedly write the smaller front element back."
      ],
      "trivia": [
        "Invented by John von Neumann in 1945, one of the first sorting algorithms ever written for a stored-program computer.",
        "It is stable and always O(n log n), so it is the usual choice for sorting linked lists and huge files that do not fit into memory (external sorting).",
        "Its weakness is the O(n) extra buffer. In-place merging exists, but it is complicated and slow."
      ],
      "tip": {
        "text": "Use the \"Stability test\" input: equal keys keep their colour order.",
        "try": {
          "input": "stability",
          "size": 128
        }
      }
    },
    {
      "id": "mergebu",
      "name": "Merge Sort (bottom-up)",
      "cat": "merge",
      "best": "n log n",
      "avg": "n log n",
      "worst": "n log n",
      "mem": "n",
      "stable": true,
      "comparison": true,
      "summary": "Merges runs of width 1, 2, 4, 8… without any recursion.",
      "how": "The iterative version of merge sort. It treats the array as n runs of length 1, merges neighbouring pairs into runs of length 2, then 4, then 8 and so on, until one run is left. It makes the same kind of merges as the top-down version, but in a very regular order across the whole array. The helper strip shows the buffer.",
      "steps": [
        "width = 1.",
        "Merge [0,w)+[w,2w), [2w,3w)+[3w,4w), … across the whole array.",
        "width *= 2 and repeat until width ≥ n."
      ],
      "trivia": [
        "It was the natural way to sort on magnetic tape drives, where you can only read data sequentially.",
        "It needs no recursion stack, so it works well on hardware or in languages without recursion.",
        "The passes are easy to see in the animation: each one sweeps once across the whole array."
      ],
      "tip": {
        "text": "Race it against top-down Merge Sort. Same work, different order.",
        "try": {
          "input": "shuffled",
          "size": 256
        }
      }
    },
    {
      "id": "tim",
      "name": "Timsort",
      "cat": "merge",
      "best": "n",
      "avg": "n log n",
      "worst": "n log n",
      "mem": "n",
      "stable": true,
      "comparison": true,
      "summary": "A hybrid of merge sort and insertion sort that uses order already present in the data.",
      "how": "Real data often contains \"runs\" that are already sorted. Timsort scans the array for such runs and reverses runs that are strictly descending. Runs shorter than a minimum length (\"minrun\", 16–32 here) are extended with binary insertion sort. The runs go onto a stack, and neighbouring runs are merged so that the run lengths stay balanced, like Fibonacci numbers. This visualisation shows a simplified version without \"galloping mode\". The helper strip shows the merge buffer.",
      "steps": [
        "Find the next natural run and reverse it if it is descending.",
        "Extend it to minrun with binary insertion sort.",
        "Push it onto the run stack and merge runs while the balance rules are broken.",
        "At the end, merge everything that is left on the stack."
      ],
      "trivia": [
        "Written by Tim Peters in 2002 for Python's list.sort().",
        "Since adopted by Java (for objects), Android, Swift and V8/Chrome (Array.prototype.sort since 2018).",
        "In 2015 researchers tried to formally verify it and found a bug in its invariant. It could crash Java's implementation on huge crafted inputs, and Python had the same flaw.",
        "On already sorted data it needs only n−1 comparisons."
      ],
      "tip": {
        "text": "Try \"Organ pipe\": two long runs, one of them reversed.",
        "try": {
          "input": "organ",
          "size": 256
        }
      }
    },
    {
      "id": "inplacemerge",
      "name": "In-Place Merge Sort (SymMerge)",
      "cat": "merge",
      "best": "n log n",
      "avg": "n log² n",
      "worst": "n log² n",
      "mem": "log n",
      "stable": true,
      "comparison": true,
      "summary": "A stable merge sort without any buffer: it merges by rotating blocks.",
      "how": "First every block of 20 elements is sorted with insertion sort. Then neighbouring blocks are merged, doubling the block size each round. The merge (SymMerge) needs no buffer. It binary-searches a cut point so that exchanging two middle pieces leaves two smaller, independent merge problems, which are solved recursively. The exchange is a \"rotation\" done purely with block swaps.",
      "steps": [
        "Insertion-sort blocks of 20.",
        "Merge neighbouring blocks with SymMerge, doubling the block size.",
        "SymMerge: binary-search the cut, rotate, recurse on both sides."
      ],
      "trivia": [
        "Go's standard library uses exactly this scheme for sort.Stable.",
        "SymMerge was published by Pok-Son Kim and Arne Kutzner in 2004.",
        "O(n log n) in-place stable sorting is also possible (block sort / WikiSort, GrailSort), but those implementations are thousands of lines long."
      ],
      "tip": {
        "text": "Use the \"Stability test\" input: equal keys keep their colour order.",
        "try": {
          "input": "stability",
          "size": 128
        }
      }
    },
    {
      "id": "patience",
      "name": "Patience Sort",
      "cat": "merge",
      "best": "n",
      "avg": "n log n",
      "worst": "n log n",
      "mem": "n",
      "stable": false,
      "comparison": true,
      "summary": "Deals cards onto piles like the solitaire game, then merges the piles.",
      "how": "Deal the elements one by one. Each card goes onto the leftmost pile whose top card is ≥ it (found by binary search), or starts a new pile. Every pile is then sorted from top to bottom, and the tops increase from left to right. In the second phase the smallest top card is repeatedly taken with the help of a min-heap of piles and written to the next position. The helper strip shows the current top of every pile.",
      "steps": [
        "Deal: binary-search the leftmost pile with top ≥ x.",
        "Put x there or start a new pile.",
        "Collect: repeatedly take the smallest pile top (min-heap)."
      ],
      "trivia": [
        "Named after the card game patience (solitaire).",
        "The number of piles equals the length of the longest increasing subsequence, a classic O(n log n) way to compute it.",
        "The idea is used in \"patience diff\" (available in Git and Bazaar) for comparing files."
      ],
      "tip": {
        "text": "\"Reversed\" input: everything ends up on a single pile.",
        "try": {
          "input": "reversed",
          "size": 64
        }
      }
    },
    {
      "id": "strand",
      "name": "Strand Sort",
      "cat": "merge",
      "best": "n",
      "avg": "n²",
      "worst": "n²",
      "mem": "n",
      "stable": true,
      "comparison": true,
      "summary": "Pulls increasing \"strands\" out of the input and merges them into the result.",
      "how": "Take the first remaining element as the start of a strand. Walk through the rest: every element that is ≥ the last element of the strand is moved into the strand, and the others stay (they are packed to the front). The strand is sorted by construction and is merged into the result. Repeat until nothing is left. The two helper strips show the result and the current strand.",
      "steps": [
        "Start a strand with the first remaining element.",
        "Move every element ≥ the strand's last element into the strand.",
        "Merge the strand into the result.",
        "Repeat, then copy the result back."
      ],
      "trivia": [
        "Very efficient when the data consists of a few long increasing runs. Its best case is O(n) on sorted input.",
        "It works naturally on linked lists, where removing an element is cheap.",
        "Equal keys are never split in the wrong order between strands, so the algorithm is stable."
      ],
      "tip": {
        "text": "\"Sawtooth\" input: only a few strands are needed.",
        "try": {
          "input": "sawtooth",
          "size": 128
        }
      }
    },
    {
      "id": "quicklomuto",
      "name": "Quick Sort (Lomuto)",
      "cat": "quick",
      "best": "n log n",
      "avg": "n log n",
      "worst": "n²",
      "mem": "log n",
      "stable": false,
      "comparison": true,
      "summary": "Partitions around the last element, then recurses on both sides.",
      "how": "Pick the last element as the pivot (purple). Scan the range with index j and keep a boundary i: every element smaller than the pivot is swapped to position i, and i moves up. At the end the pivot is swapped to position i. Now everything left of it is smaller and everything right of it is larger or equal. Then both sides are sorted recursively.",
      "steps": [
        "pivot = a[hi].",
        "For j from lo to hi−1: if a[j] < pivot, swap a[i] and a[j], i++.",
        "Swap the pivot to a[i]. It is now in its final position.",
        "Recurse on [lo, i−1] and [i+1, hi]."
      ],
      "trivia": [
        "Tony Hoare invented quicksort in 1959 in Moscow, while working on machine translation and needing to sort Russian words. Published in 1961.",
        "The Lomuto scheme (by Nico Lomuto) became popular through Jon Bentley's \"Programming Pearls\" because it is easy to get right.",
        "On already sorted input the last element is always the maximum, so each partition only removes one element: O(n²)."
      ],
      "tip": {
        "text": "Choose \"Sorted\" input to see the O(n²) worst case.",
        "try": {
          "input": "sorted",
          "size": 128
        }
      }
    },
    {
      "id": "quickhoare",
      "name": "Quick Sort (Hoare, median-of-3)",
      "cat": "quick",
      "best": "n log n",
      "avg": "n log n",
      "worst": "n²",
      "mem": "log n",
      "stable": false,
      "comparison": true,
      "summary": "Two pointers move towards each other and swap elements that are on the wrong side.",
      "how": "The pivot is the median of the first, middle and last elements, and it is parked at the start of the range. Pointer i moves right past elements smaller than the pivot, pointer j moves left past elements larger than it. When both stop, the two elements are on the wrong sides, so they are swapped. When the pointers cross, the pivot is swapped into its final place and both sides are sorted recursively.",
      "steps": [
        "Order a[lo], a[mid], a[hi]; the median becomes the pivot at a[lo].",
        "Move i right while a[i] < pivot; move j left while a[j] > pivot.",
        "If i < j swap a[i], a[j] and continue; otherwise put the pivot at j.",
        "Recurse on both sides."
      ],
      "trivia": [
        "Hoare's original partition scheme does about three times fewer swaps than Lomuto's on average.",
        "Median-of-three pivot selection was proposed by Robert Singleton in 1969. It makes sorted and reversed input fast instead of quadratic.",
        "Hoare received the Turing Award in 1980. He also invented Hoare logic and CSP."
      ],
      "tip": {
        "text": "The \"Killer (McIlroy)\" input is built to defeat median-of-3. Watch it go quadratic.",
        "try": {
          "input": "killer",
          "size": 512
        }
      }
    },
    {
      "id": "dualpivot",
      "name": "Dual-Pivot Quick Sort",
      "cat": "quick",
      "best": "n log n",
      "avg": "n log n",
      "worst": "n²",
      "mem": "log n",
      "stable": false,
      "comparison": true,
      "summary": "Two pivots split the array into three parts: < p, between, > q.",
      "how": "Take the first and last elements as pivots p ≤ q (both purple). One scan splits the rest into three regions: smaller than p, between p and q, and larger than q. The pivots are then swapped into their places and the three regions are sorted recursively. The middle one is skipped if p = q.",
      "steps": [
        "Make sure a[lo] ≤ a[hi]; these are the pivots p and q.",
        "Scan with i: values < p go to the left zone, values > q go to the right zone.",
        "Move p and q into their final positions.",
        "Recurse on the three parts."
      ],
      "trivia": [
        "Proposed by Vladimir Yaroslavskiy in 2009. It became Java 7's Arrays.sort() for primitive types.",
        "For decades people assumed that more pivots could not help. Later analysis showed it does about 5% fewer comparisons than classic quicksort.",
        "Its real advantage is thought to be that it scans memory fewer times, which suits modern CPU caches."
      ],
      "tip": {
        "text": "Race it against both single-pivot quicksorts.",
        "try": {
          "input": "shuffled",
          "size": 512
        }
      }
    },
    {
      "id": "quick3",
      "name": "3-Way Quick Sort (Dutch Flag)",
      "cat": "quick",
      "best": "n",
      "avg": "n log n",
      "worst": "n²",
      "mem": "log n",
      "stable": false,
      "comparison": true,
      "summary": "Splits into < pivot, = pivot and > pivot, so duplicates are finished in one go.",
      "how": "A random element is chosen as the pivot. One scan splits the range into three zones: smaller than the pivot, equal to it (the purple markers enclose this zone) and larger. Only the \"smaller\" and \"larger\" zones are sorted recursively. The whole block of equal values is already finished. With many duplicates this is dramatically faster than two-way quicksort.",
      "steps": [
        "Pick a random pivot v.",
        "Scan: < v goes left, > v goes right, = v stays in the middle.",
        "Recurse on the < and > parts only."
      ],
      "trivia": [
        "The three-way partition solves Edsger Dijkstra's \"Dutch national flag problem\" (red, white and blue stripes).",
        "With few distinct values it runs in linear time: every run of equal keys is finished after one partition.",
        "Jon Bentley and Douglas McIlroy's influential paper \"Engineering a Sort Function\" (1993) used a fast three-way partition."
      ],
      "tip": {
        "text": "\"Few unique values\": each value is finished after a single partition.",
        "try": {
          "input": "few",
          "size": 512
        }
      }
    },
    {
      "id": "intro",
      "name": "Introsort",
      "cat": "quick",
      "best": "n log n",
      "avg": "n log n",
      "worst": "n log n",
      "mem": "log n",
      "stable": false,
      "comparison": true,
      "summary": "Quicksort that switches to heap sort if it goes too deep, and finishes with insertion sort.",
      "how": "\"Introspective sort\" runs a median-of-3 quicksort but keeps an eye on its own recursion depth. If the depth exceeds 2·log₂(n), the input is probably adversarial, so that piece is heap-sorted instead. That guarantees O(n log n). Partitions smaller than 16 elements are left alone, and one final insertion sort over the whole (nearly sorted) array finishes the job.",
      "steps": [
        "Quicksort (median-of-3) while the range has > 16 elements.",
        "If the depth limit 2·log₂ n is reached, heap-sort that range.",
        "Finally, a single insertion-sort pass over the whole array."
      ],
      "trivia": [
        "Invented by David Musser in 1997.",
        "It is the algorithm behind std::sort in GNU libstdc++ and Microsoft's STL, and behind .NET's Array.Sort.",
        "The final insertion pass is fast because every element is at most ~16 positions away from its final place."
      ],
      "tip": {
        "text": "With the \"Killer (McIlroy)\" input, quicksort goes too deep and introsort switches to heap sort.",
        "try": {
          "input": "killer",
          "size": 512
        }
      }
    },
    {
      "id": "pdq",
      "name": "Pattern-Defeating Quicksort (pdqsort)",
      "cat": "quick",
      "best": "n",
      "avg": "n log n",
      "worst": "n log n",
      "mem": "log n",
      "stable": false,
      "comparison": true,
      "summary": "A modern quicksort hybrid that spots patterns and cannot be forced into O(n²).",
      "how": "pdqsort is an introsort with extra tricks. Small ranges use insertion sort, and the pivot is a median of 3 (or of 9, \"ninther\", for large ranges). If a partition needed no swaps, the range may already be sorted, so a partial insertion sort that gives up after 8 moves is tried. If a split is very unbalanced, a few elements are swapped around to break the pattern, and after too many bad splits it falls back to heapsort. Runs of values equal to the previous pivot are split off in one step.",
      "steps": [
        "Small range → insertion sort.",
        "Median-of-3 / ninther pivot, partition.",
        "Unbalanced split → shuffle a few elements; too many → heapsort.",
        "No swaps needed → try a partial insertion sort."
      ],
      "trivia": [
        "Created by Orson Peters in the mid-2010s.",
        "Go switched sort.Sort to pdqsort in Go 1.19 (2022), and Rust's sort_unstable used it for years.",
        "Boost ships it as boost::sort::pdqsort."
      ],
      "tip": {
        "text": "The \"Killer (McIlroy)\" input cannot make it quadratic.",
        "try": {
          "input": "killer",
          "size": 512
        }
      }
    },
    {
      "id": "counting",
      "name": "Counting Sort",
      "cat": "distribution",
      "best": "n + k",
      "avg": "n + k",
      "worst": "n + k",
      "mem": "n + k",
      "stable": true,
      "comparison": false,
      "summary": "Counts how often each value occurs, then writes the values in order. No comparisons.",
      "how": "Counting sort does not compare elements at all. It reads every value and counts how often each value 0…k occurs. Prefix sums of the counts give each value's final position. The elements are then placed into an output buffer (going backwards, which keeps it stable) and written back. It is only fast when the range of values k is not much larger than n. The helper strips show the count array and the output buffer.",
      "steps": [
        "Read all values and count each one.",
        "Turn the counts into prefix sums (the final positions).",
        "Place each element at its position in the output buffer, going backwards.",
        "Write the buffer back into the array."
      ],
      "trivia": [
        "Described by Harold H. Seward in 1954 in an MIT master's thesis, together with radix sort.",
        "It beats the \"Ω(n log n) lower bound\" because that bound only applies to algorithms that sort by comparing elements.",
        "Watch the counters: comparisons stay at 0."
      ],
      "tip": {
        "text": "\"Few unique\" input: the whole thing is just a few reads and writes.",
        "try": {
          "input": "few",
          "size": 256
        }
      }
    },
    {
      "id": "radixlsd",
      "name": "Radix Sort (LSD, base 10)",
      "cat": "distribution",
      "best": "n·d",
      "avg": "n·d",
      "worst": "n·d",
      "mem": "n + b",
      "stable": true,
      "comparison": false,
      "summary": "Stable counting sort on each digit, starting with the ones digit.",
      "how": "LSD = least significant digit first. The array is sorted by the ones digit, then by the tens digit, then by the hundreds and so on, each time with a stable counting sort. Because every pass is stable, the order from earlier (lower) digits is kept among equal higher digits. After the last digit the array is sorted. d is the number of digits and b = 10 is the base. The helper strips show the 10 digit counters and the output buffer.",
      "steps": [
        "For exp = 1, 10, 100, … while max / exp > 0:",
        "Read all values and bucket them by digit (v / exp) mod 10.",
        "Write them back in bucket order (stable)."
      ],
      "trivia": [
        "Punched-card sorting machines, going back to Herman Hollerith's inventions for the 1890 US census, sorted cards one column at a time, starting with the last digit.",
        "Seward adapted it for computers in 1954.",
        "After the first pass you can see the ones-digit pattern: a \"sawtooth\" in Bars view."
      ],
      "tip": {
        "text": "Watch the sawtooth patterns in Bars view with 1000 elements.",
        "try": {
          "input": "shuffled",
          "size": 1000,
          "view": "bars"
        }
      }
    },
    {
      "id": "radixmsd",
      "name": "Radix Sort (MSD, American Flag)",
      "cat": "distribution",
      "best": "n·d",
      "avg": "n·d",
      "worst": "n·d",
      "mem": "b·d",
      "stable": false,
      "comparison": false,
      "summary": "In-place: permutes the elements into 10 buckets by the top digit, then recurses into each bucket.",
      "how": "MSD = most significant digit first. For the current digit, count the bucket sizes, then permute the elements in place into their buckets by following swap cycles (like cycle sort). Then recurse into each bucket with the next lower digit. This in-place variant is called American flag sort. The helper strip shows the 10 digit counters.",
      "steps": [
        "Count how many elements fall into each of the 10 digit buckets.",
        "Compute bucket start/end positions.",
        "Swap every element into its bucket (in place).",
        "Recurse into each bucket with the next digit."
      ],
      "trivia": [
        "The name \"American flag sort\" comes from the Dutch national flag problem (three stripes). The American flag has many stripes.",
        "Described by McIlroy, Bostic and McIlroy in \"Engineering Radix Sort\" (1993).",
        "MSD radix sort is also the idea behind sorting strings alphabetically: first by the first letter, then by the second, and so on."
      ],
      "tip": {
        "text": "Use 1000 elements. The top digit splits the array into big blocks first.",
        "try": {
          "input": "shuffled",
          "size": 1000
        }
      }
    },
    {
      "id": "bucket",
      "name": "Bucket Sort",
      "cat": "distribution",
      "best": "n + k",
      "avg": "n + k",
      "worst": "n²",
      "mem": "n + k",
      "stable": true,
      "comparison": false,
      "summary": "Distributes values into √n range buckets, then insertion-sorts each bucket.",
      "how": "The value range is split into k ≈ √n equal intervals (\"buckets\"). Every value is thrown into its bucket, and the buckets are written back one after another. Now every element is already in the right region, so each bucket (purple range) only needs a short insertion sort. With evenly distributed data this takes linear time on average. The helper strip shows the buckets side by side.",
      "steps": [
        "Read all values and put each into bucket ⌊v·k / (max+1)⌋.",
        "Write the buckets back in order.",
        "Insertion-sort each bucket in place."
      ],
      "trivia": [
        "It is ideal for data that is evenly spread out, such as random floats in [0, 1).",
        "If all values land in one bucket, it becomes an insertion sort, which is O(n²).",
        "Counting sort is really a bucket sort with one bucket per possible value."
      ],
      "tip": {
        "text": "Try \"Random (duplicates)\": the buckets are then of uneven size.",
        "try": {
          "input": "dups",
          "size": 400
        }
      }
    },
    {
      "id": "gravity",
      "name": "Gravity (Bead) Sort",
      "cat": "distribution",
      "best": "S",
      "avg": "S",
      "worst": "S",
      "mem": "max",
      "stable": false,
      "comparison": false,
      "summary": "Beads slide down rods like on an abacus, and the tallest columns end up at the bottom.",
      "how": "Picture one vertical rod per possible value and one row per element. Element v puts a bead on the rods 1 … v. Then gravity pulls all beads down. Afterwards the bottom row has the most beads and the top row the fewest, so reading the rows gives the sorted values. The helper strip shows the number of beads on each rod. S is the sum of all values, which is the amount of work in a simulation.",
      "steps": [
        "Find the largest value (number of rods).",
        "For each value v, add a bead to rods 1 … v.",
        "Row k from the bottom = number of rods with more than k beads."
      ],
      "trivia": [
        "Introduced by Joshua Arulanandham, Cristian Calude and Michael Dinneen in 2002.",
        "With real beads everything falls at the same time. Simulated on a computer, the work is proportional to the sum of all values.",
        "It only works for positive integers, and the values are rebuilt from bead counts rather than moved. In the stability test the elements lose their identity."
      ],
      "tip": {
        "text": "Small arrays show the idea best.",
        "try": {
          "input": "shuffled",
          "size": 48
        }
      }
    },
    {
      "id": "bitonic",
      "name": "Bitonic Sort",
      "cat": "network",
      "best": "n log² n",
      "avg": "n log² n",
      "worst": "n log² n",
      "mem": "log n",
      "stable": false,
      "comparison": true,
      "summary": "A sorting network: a fixed pattern of compare-and-swap steps, ideal for parallel hardware.",
      "how": "A \"bitonic\" sequence first goes up and then comes down. The algorithm recursively sorts the first half ascending and the second half descending, which makes the whole range bitonic. A bitonic merge then compares element i with element i+m (for a power of two m), splitting the range into two bitonic halves that can be merged recursively. The comparisons do not depend on the data at all. (This version works for any n, not only powers of two.)",
      "steps": [
        "Sort the first half descending and the second half ascending (recursively).",
        "Bitonic merge: compare/swap i with i+m across the range.",
        "Recursively merge both halves."
      ],
      "trivia": [
        "Invented by Ken Batcher in 1968.",
        "Because the comparison pattern is fixed, all comparisons of a stage can run at the same time. With enough processors it takes O(log² n) time. That is why it is popular on GPUs and FPGAs.",
        "It always does the same number of comparisons, even on sorted input."
      ],
      "tip": {
        "text": "Sorted input takes exactly as long as random input. Race it against itself!",
        "try": {
          "input": "sorted",
          "size": 256
        }
      }
    },
    {
      "id": "oddevenmerge",
      "name": "Batcher Odd-Even Merge Sort",
      "cat": "network",
      "best": "n log² n",
      "avg": "n log² n",
      "worst": "n log² n",
      "mem": "1",
      "stable": false,
      "comparison": true,
      "summary": "Batcher's other sorting network, with slightly fewer comparisons than bitonic sort.",
      "how": "Also a data-independent network of compare-and-swap steps. It merges sorted blocks of size p into blocks of size 2p. Each merge compares the elements at distance k = p, p/2, …, 1, but only pairs that lie inside the same 2p-block. This iterative version runs with three nested loops and no recursion.",
      "steps": [
        "For block size p = 1, 2, 4, …:",
        "For distance k = p, p/2, …, 1:",
        "Compare/swap (i, i+k) where both are in the same 2p-block."
      ],
      "trivia": [
        "Published by Ken Batcher in 1968, in the same paper as bitonic sort.",
        "It uses fewer comparators than the bitonic network, but its wiring is harder to lay out on a chip.",
        "The smallest possible networks are only known for small n. Proving that 9 inputs need exactly 25 comparators took until 2014, with computer help."
      ],
      "tip": {
        "text": "Race it against Bitonic Sort.",
        "try": {
          "input": "shuffled",
          "size": 256
        }
      }
    },
    {
      "id": "stooge",
      "name": "Stooge Sort",
      "cat": "joke",
      "best": "n^2.71",
      "avg": "n^2.71",
      "worst": "n^2.71",
      "mem": "log n",
      "stable": false,
      "comparison": true,
      "summary": "Recursively sorts the first 2/3, the last 2/3, then the first 2/3 again.",
      "how": "If the first element is larger than the last, swap them. If the range has more than two elements, sort the first two thirds, then the last two thirds, then the first two thirds again, all recursively. Surprisingly it is correct, but it is even slower than bubble sort: O(n^(log 3 / log 1.5)) ≈ O(n^2.71).",
      "steps": [
        "If a[first] > a[last], swap them.",
        "If the length is > 2: t = ⌊len/3⌋.",
        "Stooge-sort [first, last−t], then [first+t, last], then [first, last−t] again."
      ],
      "trivia": [
        "Named after the Three Stooges, a comedy trio whose members keep slapping each other.",
        "It appears as an exercise in the famous textbook \"Introduction to Algorithms\" (CLRS), credited to \"Professors Howard, Fine and Howard\", the real names of the Stooges.",
        "This page stops after 3 million operations. Use ≤ 64 elements."
      ],
      "tip": {
        "text": "Keep it small, otherwise it hits the operation limit.",
        "try": {
          "input": "shuffled",
          "size": 40
        }
      }
    },
    {
      "id": "slow",
      "name": "Slowsort",
      "cat": "joke",
      "best": "n^(log n)",
      "avg": "n^(log n)",
      "worst": "n^(log n)",
      "mem": "n",
      "stable": false,
      "comparison": true,
      "summary": "A deliberately terrible \"multiply and surrender\" algorithm.",
      "how": "To sort a range: slowsort both halves, which puts each half's maximum at the end of that half. The larger of the two maxima is the overall maximum, so it is swapped to the end. Then slowsort everything except the last element. It is correct, but even its best case is not polynomial.",
      "steps": [
        "Slowsort the first half, slowsort the second half.",
        "Move the larger of the two halves' last elements to the very end.",
        "Slowsort everything except the last element."
      ],
      "trivia": [
        "Published by Andrei Broder and Jorge Stolfi in the mid-1980s joke paper \"Pessimal Algorithms and Simplexity Analysis\".",
        "They called its method \"multiply and surrender\", a parody of divide and conquer.",
        "Its running time T(n) grows like n^(log n / (2+ε)), so it is slower than any polynomial."
      ],
      "tip": {
        "text": "Use about 24 elements.",
        "try": {
          "input": "shuffled",
          "size": 24
        }
      }
    },
    {
      "id": "bogo",
      "name": "Bogo Sort",
      "cat": "joke",
      "best": "n",
      "avg": "n·n!",
      "worst": "∞",
      "mem": "1",
      "stable": false,
      "comparison": false,
      "summary": "Shuffle randomly until it happens to be sorted.",
      "how": "Check whether the array is sorted. If not, shuffle everything randomly (Fisher–Yates) and check again. The expected number of shuffles for distinct values is n!. With 10 elements that is 3.6 million shuffles. With 20 elements it is 2.4 quintillion, so even a billion shuffles per second would take about 77 years.",
      "steps": [
        "Check if the array is sorted. If yes, done!",
        "Otherwise shuffle it randomly.",
        "Go back to step 1."
      ],
      "trivia": [
        "Also called permutation sort, stupid sort, shotgun sort or monkey sort (after the infinite monkey theorem).",
        "\"Quantum bogosort\" joke: shuffle, and if the list is not sorted, destroy the universe. In the surviving universes it runs in O(n).",
        "\"Bozosort\" is a variant that only swaps two random elements each time.",
        "This page stops after 3 million operations. With ≤ 7 elements you will usually see it finish."
      ],
      "tip": {
        "text": "Six elements: usually done in a few hundred shuffles.",
        "try": {
          "input": "shuffled",
          "size": 6
        }
      }
    },
    {
      "id": "sleep",
      "name": "Sleep Sort",
      "cat": "joke",
      "best": "n + max",
      "avg": "n + max",
      "worst": "n + max",
      "mem": "n",
      "stable": false,
      "comparison": false,
      "summary": "Every element sleeps as long as its value and then reports back, so the smallest wake up first.",
      "how": "For each element a thread is started that sleeps for a time proportional to its value and then appends the value to the output. The thread with the smallest value wakes up first, so the output is sorted. Here the threads are simulated: the helper strip shows the sleeping threads, and each one disappears when it wakes up.",
      "steps": [
        "Start one sleeping thread per element.",
        "When a thread wakes up, append its value to the output."
      ],
      "trivia": [
        "Posted anonymously on 4chan's /prog/ board in 2011 and instantly became a classic.",
        "It does not really avoid sorting: the operating system's timer queue does the sorting, usually with a heap.",
        "With real threads, values that are close together can wake up in the wrong order, so it is not even reliable."
      ],
      "tip": {
        "text": "Small array, slow speed.",
        "try": {
          "input": "shuffled",
          "size": 32
        }
      }
    },
    {
      "id": "spaghetti",
      "name": "Spaghetti Sort",
      "cat": "joke",
      "best": "n",
      "avg": "n",
      "worst": "n",
      "mem": "n",
      "stable": false,
      "comparison": false,
      "summary": "An \"analog\" O(n) sort: stand up a bundle of spaghetti and keep pulling out the tallest rod.",
      "how": "Cut one spaghetti rod per value, with its length equal to the value, and stand the whole bundle upright on the table. Lower your hand: it touches the tallest rod first. Pull it out, and it becomes the last element of the output. Repeat. Finding the tallest rod is instant for a hand, which is the whole trick.",
      "steps": [
        "Stand all rods upright.",
        "Lower the hand until it touches the tallest rod.",
        "Remove it → next position from the end."
      ],
      "trivia": [
        "Described by A. K. Dewdney in his Scientific American column (1984) as an example of an analog \"computer\".",
        "It is only O(n) with physical parallelism. A computer has to search for the tallest rod, which makes it selection sort.",
        "Here each \"hand touch\" counts as one comparison, which is why the counter looks suspiciously small."
      ],
      "tip": {
        "text": "Compare the comparison counter with Selection Sort.",
        "try": {
          "input": "shuffled",
          "size": 64
        }
      }
    }
  ];
  global.SortViz = global.SortViz || {};
  global.SortViz.CATEGORIES = CATEGORIES;
  global.SortViz.INFO = INFO;
})(typeof window !== 'undefined' ? window : globalThis);
