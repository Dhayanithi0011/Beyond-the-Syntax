"""
Coding round question bank — 10 sets x 3 problems across 10 distinct domains,
1 easy + 2 intermediate per set. Source of truth for Round 2; the seed script
REPLACES the competition's coding problems with this bank on every run.

Each problem carries:
  title / domain / difficulty / statement (markdown, with worked examples) /
  constraints / 2 sample cases / 2 direct (visible self-check) cases /
  5 hidden (judge-only) cases.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Problem:
    set_number: int
    q_number: int
    title: str
    domain: str
    difficulty: str  # "easy" | "intermediate"
    statement: str
    constraints: str
    max_score: int = 100
    time_limit_ms: int = 2000
    memory_limit_mb: int = 256
    samples: list = field(default_factory=list)   # [(input, output)] x2
    direct: list = field(default_factory=list)    # [(input, output)] x2 visible
    hidden: list = field(default_factory=list)    # [(input, output)] x5


PROBLEM_BANK: list[Problem] = [
    # ───────────────────────────── SET 1 ─────────────────────────────
    Problem(
        set_number=1, q_number=1,
        title="Second Largest Distinct Element",
        domain="Arrays", difficulty="easy",
        statement=(
            "Given an array of **N** integers, find the second largest **distinct** element in the array. "
            "If no such element exists (for example, when every element is the same), output -1.\n\n"
            "**Input Format**  \n"
            "Line 1: an integer N.  \n"
            "Line 2: N space-separated integers A[1..N].\n\n"
            "**Output Format**  \n"
            "A single integer: the second largest distinct value, or -1 if it does not exist.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `5 / 12 35 1 10 34` → `34`. Distinct values sorted descending: "
            "35, 34, 12, 10, 1; the second largest is 34.  \n"
            "- **Sample 2:** `3 / 10 10 10` → `-1`. Only one distinct value exists, so there is no second largest."
        ),
        constraints="1 ≤ N ≤ 10^5  \n-10^9 ≤ A[i] ≤ 10^9",
        samples=[("5\n12 35 1 10 34", "34"), ("3\n10 10 10", "-1")],
        direct=[("6\n5 5 5 6 6 7", "6"), ("4\n-1 -2 -3 -4", "-2")],
        hidden=[("1\n5", "-1"), ("5\n100 90 90 80 100", "90"), ("2\n7 7", "-1"),
                ("7\n1 2 3 4 5 6 7", "6"),
                ("4\n1000000000 -1000000000 999999999 1000000000", "999999999")],
    ),
    Problem(
        set_number=1, q_number=2,
        title="String Compression (Run-Length Encoding)",
        domain="Strings", difficulty="intermediate",
        statement=(
            "Given a string S of uppercase English letters, compress it using run-length encoding: replace every "
            "run of consecutive repeating characters with the character followed by the run's count (omit the count "
            "when it is 1). If the compressed string is NOT strictly shorter than the original string, output the "
            "original string instead.\n\n"
            "**Input Format**  \n"
            "A single line containing the string S.\n\n"
            "**Output Format**  \n"
            "The compressed string, or the original string if compression does not shorten it.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `AAABBBCCDAA` → `A3B3C2DA2`. Runs: A3 B3 C2 D A2 → \"A3B3C2DA2\" (length 9) is "
            "shorter than the original (length 11).  \n"
            "- **Sample 2:** `ABCD` → `ABCD`. Every run has length 1, so the compressed form is the same length "
            "as the original; the original is printed."
        ),
        constraints="1 ≤ |S| ≤ 10^5  \nS contains only uppercase English letters.",
        samples=[("AAABBBCCDAA", "A3B3C2DA2"), ("ABCD", "ABCD")],
        direct=[("AABBCC", "AABBCC"), ("AAAAAAAAAA", "A10")],
        hidden=[("Z", "Z"), ("AABBBAA", "A2B3A2"), ("ABABAB", "ABABAB"),
                ("WWWWWWWWWWWWWWWWWWWW", "W20"), ("PPQQQRRRRS", "P2Q3R4S")],
    ),
    Problem(
        set_number=1, q_number=3,
        title="House Robber",
        domain="Dynamic Programming", difficulty="intermediate",
        statement=(
            "Houses are arranged in a line; house i contains A[i] amount of money. A thief cannot rob two "
            "**adjacent** houses (doing so triggers an alarm). Find the maximum total amount of money the thief "
            "can rob.\n\n"
            "**Input Format**  \n"
            "Line 1: an integer N.  \n"
            "Line 2: N space-separated non-negative integers A[1..N].\n\n"
            "**Output Format**  \n"
            "A single integer: the maximum amount that can be robbed.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `4 / 1 2 3 1` → `4`. Rob house 1 and house 3: 1 + 3 = 4.  \n"
            "- **Sample 2:** `5 / 2 7 9 3 1` → `12`. Rob houses 1, 3 and 5: 2 + 9 + 1 = 12."
        ),
        constraints="1 ≤ N ≤ 10^5  \n0 ≤ A[i] ≤ 10^4",
        samples=[("4\n1 2 3 1", "4"), ("5\n2 7 9 3 1", "12")],
        direct=[("1\n5", "5"), ("2\n5 10", "10")],
        hidden=[("3\n5 1 1", "6"), ("6\n5 5 10 100 10 5", "110"), ("1\n0", "0"),
                ("4\n0 0 0 0", "0"), ("7\n2 1 1 2 100 3 1", "104")],
    ),
    # ───────────────────────────── SET 2 ─────────────────────────────
    Problem(
        set_number=2, q_number=1,
        title="Digital Root",
        domain="Recursion", difficulty="easy",
        statement=(
            "Given a non-negative integer N, find its digital root: repeatedly sum the digits of N until a single "
            "digit remains. You MUST implement the \"repeat until a single digit remains\" logic using a **recursive "
            "function**.\n\n"
            "**Input Format**  \n"
            "A single integer N.\n\n"
            "**Output Format**  \n"
            "A single digit (0-9): the digital root of N.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `12345` → `6`. 1+2+3+4+5 = 15, then 1+5 = 6.  \n"
            "- **Sample 2:** `9875` → `2`. 9+8+7+5 = 29, then 2+9 = 11, then 1+1 = 2."
        ),
        constraints="0 ≤ N ≤ 10^18",
        samples=[("12345", "6"), ("9875", "2")],
        direct=[("0", "0"), ("9", "9")],
        hidden=[("99999", "9"), ("123456789", "9"), ("1000000000000000000", "1"),
                ("55", "1"), ("48", "3")],
    ),
    Problem(
        set_number=2, q_number=2,
        title="Number of Islands",
        domain="Graphs", difficulty="intermediate",
        statement=(
            "Given an M x N grid of '0's (water) and '1's (land), count the number of islands. An island is formed "
            "by connecting adjacent lands **horizontally or vertically** and is surrounded entirely by water.\n\n"
            "**Input Format**  \n"
            "Line 1: two integers M and N.  \n"
            "Next M lines: a string of N characters ('0' or '1') each.\n\n"
            "**Output Format**  \n"
            "A single integer: the number of islands.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `4 5` grid with rows `11000, 11000, 00100, 00011` → `3`. The top-left block, the "
            "isolated middle cell, and the bottom-right block form 3 islands.  \n"
            "- **Sample 2:** `3 3` all-ones grid → `1`. All land cells are connected, forming a single island."
        ),
        constraints="1 ≤ M, N ≤ 300",
        samples=[("4 5\n11000\n11000\n00100\n00011", "3"), ("3 3\n111\n111\n111", "1")],
        direct=[("1 1\n0", "0"), ("1 1\n1", "1")],
        hidden=[("2 2\n10\n01", "2"), ("5 5\n00000\n01010\n00000\n01010\n00000", "4"),
                ("3 4\n1111\n0000\n1111", "2"), ("4 4\n1100\n1100\n0011\n0011", "2"),
                ("6 6\n000000\n000000\n000000\n000000\n000000\n000000", "0")],
    ),
    Problem(
        set_number=2, q_number=3,
        title="Maximum Non-Overlapping Meetings",
        domain="Greedy", difficulty="intermediate",
        statement=(
            "Given N meetings, each with a start and end time, select the maximum number of meetings a single person "
            "can attend such that no two selected meetings overlap. A meeting may start **exactly** when another one "
            "ends.\n\n"
            "**Input Format**  \n"
            "Line 1: an integer N.  \n"
            "Next N lines: two integers start and end.\n\n"
            "**Output Format**  \n"
            "A single integer: the maximum number of meetings that can be attended.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** meetings `(1,2), (3,4), (0,6), (5,7), (8,9), (5,9)` → `4`. Attend (1,2), (3,4), "
            "(5,7) and (8,9).  \n"
            "- **Sample 2:** `(10,20), (12,25), (20,30)` → `2`. Attend (10,20) then (20,30)."
        ),
        constraints="1 ≤ N ≤ 10^5  \n0 ≤ start < end ≤ 10^9",
        samples=[("6\n1 2\n3 4\n0 6\n5 7\n8 9\n5 9", "4"), ("3\n10 20\n12 25\n20 30", "2")],
        direct=[("1\n5 10", "1"), ("2\n1 10\n2 3", "1")],
        hidden=[("4\n1 3\n2 4\n3 5\n4 6", "2"), ("5\n1 2\n2 3\n3 4\n4 5\n5 6", "5"),
                ("3\n1 100\n2 3\n4 5", "2"), ("1\n0 1000000000", "1"),
                ("7\n1 4\n2 5\n3 6\n5 7\n6 8\n7 9\n8 10", "3")],
    ),
    # ───────────────────────────── SET 3 ─────────────────────────────
    Problem(
        set_number=3, q_number=1,
        title="GCD and LCM",
        domain="Math", difficulty="easy",
        statement=(
            "Given two positive integers A and B, compute their Greatest Common Divisor (GCD) and Least Common "
            "Multiple (LCM).\n\n"
            "**Input Format**  \n"
            "A single line with two integers A and B.\n\n"
            "**Output Format**  \n"
            "Two space-separated integers: GCD and LCM.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `12 18` → `6 36`. GCD(12,18)=6, LCM(12,18)=36.  \n"
            "- **Sample 2:** `7 13` → `1 91`. 7 and 13 are coprime, so GCD=1 and LCM=7×13=91."
        ),
        constraints="1 ≤ A, B ≤ 10^9",
        samples=[("12 18", "6 36"), ("7 13", "1 91")],
        direct=[("100 100", "100 100"), ("1 999999937", "1 999999937")],
        hidden=[("24 36", "12 72"), ("17 34", "17 34"),
                ("1000000000 999999999", "1 999999999000000000"),
                ("9 28", "1 252"), ("60 48", "12 240")],
    ),
    Problem(
        set_number=3, q_number=2,
        title="Kth Smallest Element",
        domain="Searching & Sorting", difficulty="intermediate",
        statement=(
            "Given an unsorted array of N **distinct** integers and an integer K, find the Kth smallest element of "
            "the array.\n\n"
            "**Input Format**  \n"
            "Line 1: two integers N and K.  \n"
            "Line 2: N space-separated integers.\n\n"
            "**Output Format**  \n"
            "A single integer: the Kth smallest element.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `6 3` on `7 10 4 3 20 15` → `7`. Sorted: 3, 4, 7, 10, 15, 20; the 3rd smallest is 7.  \n"
            "- **Sample 2:** `5 1` on `5 4 3 2 1` → `1`. The 1st smallest is the minimum, 1."
        ),
        constraints="1 ≤ K ≤ N ≤ 10^5",
        samples=[("6 3\n7 10 4 3 20 15", "7"), ("5 1\n5 4 3 2 1", "1")],
        direct=[("1 1\n42", "42"), ("4 4\n1 2 3 4", "4")],
        hidden=[("7 4\n1 23 12 9 30 2 50", "12"), ("5 2\n-5 -1 -10 3 0", "-5"),
                ("10 10\n10 9 8 7 6 5 4 3 2 1", "10"), ("3 2\n100 50 75", "75"),
                ("6 5\n1000000000 -1000000000 0 500 -500 999999999", "999999999")],
    ),
    Problem(
        set_number=3, q_number=3,
        title="Balanced Parentheses",
        domain="Stacks & Queues", difficulty="intermediate",
        statement=(
            "Given a string containing only the characters '(', ')', '{', '}', '[' and ']', determine whether the "
            "string is valid: every opening bracket must be closed by the same type of bracket, and brackets must "
            "close in the correct order.\n\n"
            "**Input Format**  \n"
            "A single line containing the string S.\n\n"
            "**Output Format**  \n"
            "\"YES\" if the string is valid, otherwise \"NO\".\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `{[()()]}` → `YES`. Every bracket is closed correctly and in order.  \n"
            "- **Sample 2:** `{[(])}` → `NO`. The ']' closes before the matching '(' is closed, breaking the order."
        ),
        constraints="1 ≤ |S| ≤ 10^5",
        samples=[("{[()()]}", "YES"), ("{[(])}", "NO")],
        direct=[("()", "YES"), ("(", "NO")],
        hidden=[("([{}])", "YES"), (")(", "NO"), ("{{{{}}}}", "YES"),
                ("[({)}]", "NO"), ("[]", "YES")],
    ),
    # ───────────────────────────── SET 4 ─────────────────────────────
    Problem(
        set_number=4, q_number=1,
        title="First Non-Repeating Character",
        domain="Hashing", difficulty="easy",
        statement=(
            "Given a string S of lowercase English letters, find the first character that does not repeat anywhere "
            "else in the string. If every character repeats, print -1.\n\n"
            "**Input Format**  \n"
            "A single line containing the string S.\n\n"
            "**Output Format**  \n"
            "The first non-repeating character, or -1 if none exists.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `swiss` → `w`. 's' appears 3 times, 'w' appears once and comes first among unique "
            "characters.  \n"
            "- **Sample 2:** `aabbcc` → `-1`. Every character repeats."
        ),
        constraints="1 ≤ |S| ≤ 10^5",
        samples=[("swiss", "w"), ("aabbcc", "-1")],
        direct=[("z", "z"), ("aabbc", "c")],
        hidden=[("teeter", "r"), ("xxyyzz", "-1"), ("abcabcde", "d"),
                ("aabbccdde", "e"), ("mississippi", "m")],
    ),
    Problem(
        set_number=4, q_number=2,
        title="BST Level Order Traversal",
        domain="Trees", difficulty="intermediate",
        statement=(
            "You are given N **distinct** integers. Insert them one by one, in the given order, into an initially "
            "empty Binary Search Tree using standard BST insertion rules. Print the level-order (breadth-first) "
            "traversal of the resulting tree.\n\n"
            "**Input Format**  \n"
            "Line 1: an integer N.  \n"
            "Line 2: N space-separated distinct integers (insertion order).\n\n"
            "**Output Format**  \n"
            "A single line: the level-order traversal, space-separated.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** insertion `50 30 70 20 40 60 80` → `50 30 70 20 40 60 80`. The insertion order "
            "already matches level order for this balanced BST.  \n"
            "- **Sample 2:** insertion `10 5 15 1` → `10 5 15 1`. 1 becomes the left child of 5, which is the "
            "left child of the root 10."
        ),
        constraints="1 ≤ N ≤ 1000",
        samples=[("7\n50 30 70 20 40 60 80", "50 30 70 20 40 60 80"),
                 ("4\n10 5 15 1", "10 5 15 1")],
        direct=[("1\n99", "99"), ("3\n5 3 8", "5 3 8")],
        hidden=[("5\n1 2 3 4 5", "1 2 3 4 5"), ("5\n5 4 3 2 1", "5 4 3 2 1"),
                ("6\n20 10 30 5 15 25", "20 10 30 5 15 25"),
                ("2\n100 50", "100 50"), ("8\n8 4 12 2 6 10 14 1", "8 4 12 2 6 10 14 1")],
    ),
    Problem(
        set_number=4, q_number=3,
        title="All Permutations of a String",
        domain="Backtracking", difficulty="intermediate",
        statement=(
            "Given a string S of **distinct** characters, print all permutations of S in lexicographically sorted "
            "order, one permutation per line.\n\n"
            "**Input Format**  \n"
            "A single line containing the string S (distinct uppercase letters).\n\n"
            "**Output Format**  \n"
            "All permutations of S, one per line, in lexicographic order.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `AB` → `AB\\nBA`. The two permutations of \"AB\" in lexicographic order.  \n"
            "- **Sample 2:** `A` → `A`. A single character has only one permutation."
        ),
        constraints="1 ≤ |S| ≤ 7",
        samples=[("AB", "AB\nBA"), ("A", "A")],
        direct=[("XY", "XY\nYX"), ("ABC", "ABC\nACB\nBAC\nBCA\nCAB\nCBA")],
        hidden=[("Z", "Z"), ("PQ", "PQ\nQP"), ("MNO", "MNO\nMON\nNMO\nNOM\nOMN\nONM"),
                ("DEF", "DEF\nDFE\nEDF\nEFD\nFDE\nFED"), ("AC", "AC\nCA")],
    ),
    # ───────────────────────────── SET 5 ─────────────────────────────
    Problem(
        set_number=5, q_number=1,
        title="Maximum Sum Subarray of Size K",
        domain="Sliding Window", difficulty="easy",
        statement=(
            "Given an array of N integers and an integer K, find the maximum sum of any contiguous subarray of "
            "size **exactly** K.\n\n"
            "**Input Format**  \n"
            "Line 1: two integers N and K.  \n"
            "Line 2: N space-separated integers.\n\n"
            "**Output Format**  \n"
            "A single integer: the maximum sum among all windows of size K.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `8 3` on `2 1 5 1 3 2 1 4` → `9`. Window [5,1,3] gives the maximum sum, 9.  \n"
            "- **Sample 2:** `5 5` on `1 2 3 4 5` → `15`. There is only one window of size 5, sum = 15."
        ),
        constraints="1 ≤ K ≤ N ≤ 10^5",
        samples=[("8 3\n2 1 5 1 3 2 1 4", "9"), ("5 5\n1 2 3 4 5", "15")],
        direct=[("4 1\n5 1 9 2", "9"), ("3 2\n-1 -2 -3", "-3")],
        hidden=[("6 2\n4 2 1 7 8 1", "15"), ("5 3\n100 200 300 400 500", "1200"),
                ("1 1\n7", "7"), ("7 4\n1 4 2 10 2 3 1", "18"),
                ("10 5\n1 -1 1 -1 1 -1 1 -1 1 -1", "1")],
    ),
    Problem(
        set_number=5, q_number=2,
        title="Single Number (XOR)",
        domain="Bit Manipulation", difficulty="intermediate",
        statement=(
            "Given an array in which every element appears **exactly twice** except for one element that appears "
            "exactly once, find that unique element. Your solution should run in O(N) time using O(1) extra space "
            "(use the XOR bitwise operator).\n\n"
            "**Input Format**  \n"
            "Line 1: an integer N (N is odd).  \n"
            "Line 2: N space-separated integers.\n\n"
            "**Output Format**  \n"
            "A single integer: the element that appears only once.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `5 / 4 1 2 1 2` → `4`. 1 and 2 each appear twice; 4 appears once.  \n"
            "- **Sample 2:** `1 / 99` → `99`. The single element is trivially the answer."
        ),
        constraints="1 ≤ N ≤ 10^5  \nN is odd",
        samples=[("5\n4 1 2 1 2", "4"), ("1\n99", "99")],
        direct=[("3\n1 1 5", "5"), ("7\n10 20 10 30 20 40 30", "40")],
        hidden=[("5\n-1 -1 -2 -3 -2", "-3"), ("9\n5 5 6 6 7 7 8 8 9", "9"),
                ("3\n0 1 1", "0"), ("11\n2 2 3 3 4 4 5 5 6 6 100", "100"),
                ("1\n-500", "-500")],
    ),
    Problem(
        set_number=5, q_number=3,
        title="Round Robin Scheduling - Average Waiting Time",
        domain="Simulation", difficulty="intermediate",
        statement=(
            "N processes arrive at time 0 (in the given order) with given burst times. Using Round Robin CPU "
            "scheduling with time quantum Q (processes not finished within a quantum are placed at the back of the "
            "ready queue, after any processes already waiting), compute the average waiting time of all processes. "
            "Print the answer rounded to exactly 2 decimal places.\n\n"
            "**Input Format**  \n"
            "Line 1: two integers N and Q.  \n"
            "Line 2: N space-separated burst times.\n\n"
            "**Output Format**  \n"
            "A single value: the average waiting time, rounded to 2 decimal places.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `3 4` on bursts `24 3 3` → `5.67`. Simulating Round Robin gives waiting times 6, 4 "
            "and 7 → average 17/3 = 5.67.  \n"
            "- **Sample 2:** `2 2` on bursts `2 4` → `1.00`. Waiting times are 0 and 2 → average 1.00."
        ),
        constraints="1 ≤ N ≤ 1000  \n1 ≤ Q ≤ 1000  \n1 ≤ burst time ≤ 1000",
        samples=[("3 4\n24 3 3", "5.67"), ("2 2\n2 4", "1.00")],
        direct=[("1 5\n10", "0.00"), ("2 1\n1 1", "0.50")],
        hidden=[("4 2\n5 4 2 1", "6.00"), ("3 3\n3 3 3", "3.00"), ("1 1\n1", "0.00"),
                ("5 10\n7 7 7 7 7", "14.00"), ("2 100\n50 50", "25.00")],
    ),
    # ───────────────────────────── SET 6 ─────────────────────────────
    Problem(
        set_number=6, q_number=1,
        title="Rotate Array Left by D",
        domain="Arrays", difficulty="easy",
        statement=(
            "Given an array of N integers, rotate it to the **left** by D positions (D may exceed N; use D mod N).\n\n"
            "**Input Format**  \n"
            "Line 1: two integers N and D.  \n"
            "Line 2: N space-separated integers.\n\n"
            "**Output Format**  \n"
            "The rotated array, space-separated, on a single line.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `5 2` on `1 2 3 4 5` → `3 4 5 1 2`. Shifting left by 2 moves 1 and 2 to the end.  \n"
            "- **Sample 2:** `4 0` on `10 20 30 40` → `10 20 30 40`. A rotation of 0 leaves the array unchanged."
        ),
        constraints="1 ≤ N ≤ 10^5  \n0 ≤ D ≤ 10^9",
        samples=[("5 2\n1 2 3 4 5", "3 4 5 1 2"), ("4 0\n10 20 30 40", "10 20 30 40")],
        direct=[("3 1\n7 8 9", "8 9 7"), ("5 5\n1 2 3 4 5", "1 2 3 4 5")],
        hidden=[("6 7\n1 2 3 4 5 6", "2 3 4 5 6 1"), ("1 100\n42", "42"),
                ("4 3\n-1 -2 -3 -4", "-4 -1 -2 -3"), ("7 10\n1 2 3 4 5 6 7", "4 5 6 7 1 2 3"),
                ("2 1\n100 200", "200 100")],
    ),
    Problem(
        set_number=6, q_number=2,
        title="Longest Palindromic Substring (Length)",
        domain="Strings", difficulty="intermediate",
        statement=(
            "Given a string S, find the **length** of the longest substring of S that is a palindrome.\n\n"
            "**Input Format**  \n"
            "A single line containing the string S.\n\n"
            "**Output Format**  \n"
            "A single integer: the length of the longest palindromic substring.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `babad` → `3`. \"bab\" and \"aba\" are both palindromes of length 3.  \n"
            "- **Sample 2:** `cbbd` → `2`. \"bb\" is the longest palindromic substring."
        ),
        constraints="1 ≤ |S| ≤ 5000",
        samples=[("babad", "3"), ("cbbd", "2")],
        direct=[("a", "1"), ("aaaa", "4")],
        hidden=[("abccba", "6"), ("abcde", "1"), ("racecarxyz", "7"),
                ("forgeeksskeegfor", "10"), ("xyzzyx", "6")],
    ),
    Problem(
        set_number=6, q_number=3,
        title="Climbing Stairs with 1, 2 or 3 Steps",
        domain="Dynamic Programming", difficulty="intermediate",
        statement=(
            "A staircase has N steps. From any step you may climb **1, 2 or 3** steps at a time. Count the number "
            "of distinct ways to reach the top (step N), starting from step 0. Print the answer modulo 1000000007.\n\n"
            "**Input Format**  \n"
            "A single integer N.\n\n"
            "**Output Format**  \n"
            "The number of distinct ways, modulo 1000000007.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `4` → `7`. f(4)=f(3)+f(2)+f(1)=4+2+1=7.  \n"
            "- **Sample 2:** `1` → `1`. Only one way: a single 1-step climb."
        ),
        constraints="0 ≤ N ≤ 10^6",
        samples=[("4", "7"), ("1", "1")],
        direct=[("0", "1"), ("3", "4")],
        hidden=[("2", "2"), ("5", "13"), ("10", "274"), ("6", "24"), ("8", "81")],
    ),
    # ───────────────────────────── SET 7 ─────────────────────────────
    Problem(
        set_number=7, q_number=1,
        title="Recursive Fast Exponentiation",
        domain="Recursion", difficulty="easy",
        statement=(
            "Given a base X and a non-negative exponent N, compute (X raised to the power N) modulo 1000000007 "
            "using a **recursive divide-and-conquer fast exponentiation** algorithm that runs in O(log N) time.\n\n"
            "**Input Format**  \n"
            "A single line with two integers X and N.\n\n"
            "**Output Format**  \n"
            "A single integer: (X^N) mod 1000000007.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `2 10` → `1024`. 2^10 = 1024, which is less than the modulus.  \n"
            "- **Sample 2:** `5 0` → `1`. Any number raised to the power 0 is 1."
        ),
        constraints="1 ≤ X ≤ 10^9  \n0 ≤ N ≤ 10^9",
        samples=[("2 10", "1024"), ("5 0", "1")],
        direct=[("3 3", "27"), ("1 1000000000", "1")],
        hidden=[("2 30", "73741817"), ("10 9", "1000000000"), ("7 2", "49"),
                ("999999999 1", "999999999"), ("2 0", "1")],
    ),
    Problem(
        set_number=7, q_number=2,
        title="Detect Cycle in an Undirected Graph",
        domain="Graphs", difficulty="intermediate",
        statement=(
            "Given an undirected graph with V vertices (0-indexed) and E edges, determine whether the graph contains "
            "at least one **cycle**.\n\n"
            "**Input Format**  \n"
            "Line 1: two integers V and E.  \n"
            "Next E lines: two integers u and v denoting an edge between u and v.\n\n"
            "**Output Format**  \n"
            "\"YES\" if the graph contains a cycle, otherwise \"NO\".\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `5 5` with edges `0-1, 1-2, 2-3, 3-4, 4-0` → `YES`. Edges 0-1-2-3-4-0 form a cycle.  \n"
            "- **Sample 2:** `4 3` with edges `0-1, 1-2, 2-3` → `NO`. The edges form a simple tree (path) with no "
            "cycle."
        ),
        constraints="1 ≤ V ≤ 10^5  \n0 ≤ E ≤ 10^5",
        samples=[("5 5\n0 1\n1 2\n2 3\n3 4\n4 0", "YES"),
                 ("4 3\n0 1\n1 2\n2 3", "NO")],
        direct=[("1 0", "NO"), ("3 3\n0 1\n1 2\n2 0", "YES")],
        hidden=[("6 4\n0 1\n1 2\n3 4\n4 5", "NO"), ("6 5\n0 1\n1 2\n3 4\n4 5\n2 0", "YES"),
                ("2 1\n0 1", "NO"), ("7 7\n0 1\n1 2\n2 3\n3 4\n4 5\n5 6\n6 0", "YES"),
                ("5 0", "NO")],
    ),
    Problem(
        set_number=7, q_number=3,
        title="Minimum Currency Notes",
        domain="Greedy", difficulty="intermediate",
        statement=(
            "Given an amount A (in rupees), find the minimum number of notes/coins needed to pay exactly A, using "
            "an unlimited supply of denominations {1, 2, 5, 10, 20, 50, 100, 500, 2000}. Use the greedy strategy "
            "of always using the largest denomination possible.\n\n"
            "**Input Format**  \n"
            "A single integer A.\n\n"
            "**Output Format**  \n"
            "A single integer: the minimum number of notes/coins required.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `93` → `5`. 50 + 20 + 20 + 2 + 1 = 93, using 5 notes/coins.  \n"
            "- **Sample 2:** `0` → `0`. No notes are needed for an amount of 0."
        ),
        constraints="0 ≤ A ≤ 10^9",
        samples=[("93", "5"), ("0", "0")],
        direct=[("7", "2"), ("2000", "1")],
        hidden=[("1", "1"), ("2021", "3"), ("999999999", "500012"),
                ("500", "1"), ("19", "4")],
    ),
    # ───────────────────────────── SET 8 ─────────────────────────────
    Problem(
        set_number=8, q_number=1,
        title="Perfect Number Check",
        domain="Math", difficulty="easy",
        statement=(
            "A perfect number is a positive integer that equals the sum of its **proper divisors** (all divisors "
            "excluding itself). Given N, determine whether it is a perfect number.\n\n"
            "**Input Format**  \n"
            "A single integer N.\n\n"
            "**Output Format**  \n"
            "\"YES\" if N is a perfect number, otherwise \"NO\".\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `28` → `YES`. 1+2+4+7+14 = 28.  \n"
            "- **Sample 2:** `12` → `NO`. 1+2+3+4+6 = 16, which is not 12."
        ),
        constraints="1 ≤ N ≤ 10^8",
        samples=[("28", "YES"), ("12", "NO")],
        direct=[("6", "YES"), ("1", "NO")],
        hidden=[("496", "YES"), ("8128", "YES"), ("100", "NO"),
                ("33550336", "YES"), ("2", "NO")],
    ),
    Problem(
        set_number=8, q_number=2,
        title="Search in a Rotated Sorted Array",
        domain="Searching & Sorting", difficulty="intermediate",
        statement=(
            "Given a rotated sorted array of N **distinct** integers and a target value, find the 0-based index of "
            "the target using an O(log N) algorithm. If the target is not present, print -1.\n\n"
            "**Input Format**  \n"
            "Line 1: two integers N and target.  \n"
            "Line 2: N space-separated integers.\n\n"
            "**Output Format**  \n"
            "A single integer: the index of the target, or -1.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `7 0` on `4 5 6 7 0 1 2` → `4`. The value 0 is located at index 4.  \n"
            "- **Sample 2:** `7 3` on `4 5 6 7 0 1 2` → `-1`. 3 does not appear in the array."
        ),
        constraints="1 ≤ N ≤ 10^5",
        samples=[("7 0\n4 5 6 7 0 1 2", "4"), ("7 3\n4 5 6 7 0 1 2", "-1")],
        direct=[("1 5\n5", "0"), ("1 3\n5", "-1")],
        hidden=[("5 1\n4 5 6 1 2", "3"), ("5 6\n4 5 6 1 2", "2"),
                ("6 2\n9 12 15 2 5 6", "3"), ("4 4\n1 2 3 4", "3"),
                ("6 20\n30 40 50 10 15 20", "5")],
    ),
    Problem(
        set_number=8, q_number=3,
        title="Next Greater Element",
        domain="Stacks & Queues", difficulty="intermediate",
        statement=(
            "Given an array of N integers, for every element find its Next Greater Element (NGE): the first element "
            "to its right that is **strictly greater**. If no such element exists, its NGE is -1.\n\n"
            "**Input Format**  \n"
            "Line 1: an integer N.  \n"
            "Line 2: N space-separated integers.\n\n"
            "**Output Format**  \n"
            "N space-separated integers: the NGE for each array position, in order.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `4 / 4 5 2 25` → `5 25 25 -1`. For each element, the first larger element to its "
            "right.  \n"
            "- **Sample 2:** `4 / 13 7 6 12` → `-1 12 12 -1`. 13 has nothing greater to its right; 7 and 6 both "
            "find 12."
        ),
        constraints="1 ≤ N ≤ 10^5",
        samples=[("4\n4 5 2 25", "5 25 25 -1"), ("4\n13 7 6 12", "-1 12 12 -1")],
        direct=[("1\n10", "-1"), ("3\n1 2 3", "2 3 -1")],
        hidden=[("3\n3 2 1", "-1 -1 -1"), ("5\n1 3 2 4 1", "3 4 4 -1 -1"),
                ("6\n6 5 4 3 2 1", "-1 -1 -1 -1 -1 -1"), ("2\n5 5", "-1 -1"),
                ("7\n2 7 3 5 4 6 8", "7 8 5 6 6 8 -1")],
    ),
    # ───────────────────────────── SET 9 ─────────────────────────────
    Problem(
        set_number=9, q_number=1,
        title="Count Pairs With Given Sum",
        domain="Hashing", difficulty="easy",
        statement=(
            "Given an array of N integers and a target sum K, count the number of index pairs (i, j) with **i < j** "
            "such that A[i] + A[j] = K.\n\n"
            "**Input Format**  \n"
            "Line 1: two integers N and K.  \n"
            "Line 2: N space-separated integers.\n\n"
            "**Output Format**  \n"
            "A single integer: the number of qualifying pairs.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `5 6` on `1 5 7 -1 5` → `3`. Pairs (0,1), (0,4) and (2,3) each sum to 6.  \n"
            "- **Sample 2:** `4 8` on `1 2 3 4` → `0`. No two elements sum to 8."
        ),
        constraints="1 ≤ N ≤ 10^5",
        samples=[("5 6\n1 5 7 -1 5", "3"), ("4 8\n1 2 3 4", "0")],
        direct=[("2 4\n2 2", "1"), ("1 5\n5", "0")],
        hidden=[("6 10\n5 5 5 5 5 5", "15"), ("5 0\n-2 2 -1 1 0", "2"),
                ("3 100\n1 2 3", "0"), ("4 5\n2 3 2 3", "4"),
                ("7 14\n7 7 7 7 7 7 7", "21")],
    ),
    Problem(
        set_number=9, q_number=2,
        title="Lowest Common Ancestor in a BST",
        domain="Trees", difficulty="intermediate",
        statement=(
            "A Binary Search Tree is built by inserting N distinct integers in the given order. Given two values P "
            "and Q **known to exist** in the tree, find their Lowest Common Ancestor (LCA).\n\n"
            "**Input Format**  \n"
            "Line 1: an integer N.  \n"
            "Line 2: N space-separated integers (BST insertion order).  \n"
            "Line 3: two integers P and Q.\n\n"
            "**Output Format**  \n"
            "A single integer: the value at the LCA node.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** insertion `50 30 70 20 40 60 80`, query `20 40` → `30`. 20 and 40 are both in the "
            "left subtree rooted at 30.  \n"
            "- **Sample 2:** same tree, query `20 80` → `50`. 20 is in the left subtree and 80 is in the right "
            "subtree of the root."
        ),
        constraints="1 ≤ N ≤ 1000  \nP ≠ Q, and both values exist in the tree.",
        samples=[("7\n50 30 70 20 40 60 80\n20 40", "30"),
                 ("7\n50 30 70 20 40 60 80\n20 80", "50")],
        direct=[("3\n5 3 8\n3 8", "5"), ("3\n5 3 8\n5 3", "5")],
        hidden=[("5\n1 2 3 4 5\n1 2", "1"), ("5\n1 2 3 4 5\n4 5", "4"),
                ("6\n20 10 30 5 15 25\n5 15", "10"), ("6\n20 10 30 5 15 25\n5 25", "20"),
                ("8\n8 4 12 2 6 10 14 1\n1 6", "4")],
    ),
    Problem(
        set_number=9, q_number=3,
        title="N-Queens Count",
        domain="Backtracking", difficulty="intermediate",
        statement=(
            "Given an integer N, find the total number of distinct ways to place N non-attacking queens on an "
            "N x N chessboard (no two queens share a row, column, or diagonal).\n\n"
            "**Input Format**  \n"
            "A single integer N.\n\n"
            "**Output Format**  \n"
            "A single integer: the total number of valid arrangements.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `4` → `2`. There are exactly 2 ways to place 4 non-attacking queens on a 4x4 board.  \n"
            "- **Sample 2:** `1` → `1`. A single queen on a 1x1 board is trivially valid."
        ),
        constraints="1 ≤ N ≤ 12",
        samples=[("4", "2"), ("1", "1")],
        direct=[("2", "0"), ("8", "92")],
        hidden=[("3", "0"), ("5", "10"), ("6", "4"), ("7", "40"), ("9", "352")],
    ),
    # ───────────────────────────── SET 10 ────────────────────────────
    Problem(
        set_number=10, q_number=1,
        title="Smallest Subarray with Sum At Least Target",
        domain="Sliding Window", difficulty="easy",
        statement=(
            "Given an array of N **positive** integers and a target sum S, find the length of the smallest contiguous "
            "subarray whose sum is **greater than or equal to** S. If no such subarray exists, print 0.\n\n"
            "**Input Format**  \n"
            "Line 1: two integers N and S.  \n"
            "Line 2: N space-separated positive integers.\n\n"
            "**Output Format**  \n"
            "A single integer: the minimum length, or 0 if no subarray qualifies.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `6 7` on `2 3 1 2 4 3` → `2`. The subarray [4,3] has sum 7 and length 2, which is "
            "minimal.  \n"
            "- **Sample 2:** `3 100` on `1 2 3` → `0`. The total sum (6) never reaches 100."
        ),
        constraints="1 ≤ N ≤ 10^5  \nall array values are positive",
        samples=[("6 7\n2 3 1 2 4 3", "2"), ("3 100\n1 2 3", "0")],
        direct=[("1 5\n5", "1"), ("1 6\n5", "0")],
        hidden=[("5 11\n1 2 3 4 5", "3"), ("8 15\n5 1 3 5 10 7 4 9", "2"),
                ("4 4\n1 4 4 4", "1"), ("5 1\n1 1 1 1 1", "1"),
                ("5 20\n1 2 3 4 5", "0")],
    ),
    Problem(
        set_number=10, q_number=2,
        title="Count Set Bits from 1 to N",
        domain="Bit Manipulation", difficulty="intermediate",
        statement=(
            "Given a positive integer N, count the total number of set bits (1s) across the binary representations of "
            "every integer from 1 to N (inclusive).\n\n"
            "**Input Format**  \n"
            "A single integer N.\n\n"
            "**Output Format**  \n"
            "A single integer: the total count of set bits.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `4` → `5`. 1(1)+2(1)+3(2)+4(1) = 5 set bits in total.  \n"
            "- **Sample 2:** `7` → `12`. Sum of set bits of 1..7 is 12."
        ),
        constraints="1 ≤ N ≤ 10^9",
        samples=[("4", "5"), ("7", "12")],
        direct=[("1", "1"), ("8", "13")],
        hidden=[("10", "17"), ("15", "32"), ("16", "33"), ("2", "2"), ("9", "15")],
    ),
    Problem(
        set_number=10, q_number=3,
        title="Bank Account Operations Simulation",
        domain="Simulation", difficulty="intermediate",
        statement=(
            "There are N bank accounts, numbered 1 to N, all starting with a balance of 0. Process Q operations, "
            "each one of:  \n"
            "**DEPOSIT acc amt** — add amt to account acc's balance.  \n"
            "**WITHDRAW acc amt** — subtract amt from account acc's balance **if it has sufficient funds**; "
            "otherwise the operation is ignored.  \n"
            "**TRANSFER acc1 acc2 amt** — move amt from acc1 to acc2 **if acc1 has sufficient funds**; otherwise "
            "the operation is ignored.  \n"
            "After processing all operations, print the final balance of every account from 1 to N, one per line.\n\n"
            "**Input Format**  \n"
            "Line 1: two integers N and Q.  \n"
            "Next Q lines: one operation each, in the format described above.\n\n"
            "**Output Format**  \n"
            "N lines: the final balance of accounts 1 through N, in order.\n\n"
            "**Examples**  \n"
            "- **Sample 1:** `3 5` with DEPOSIT 1 100, DEPOSIT 2 50, TRANSFER 1 2 30, WITHDRAW 2 20, WITHDRAW 3 10 "
            "→ `70 / 60 / 0`. Account 3's withdrawal is ignored since its balance (0) is insufficient.  \n"
            "- **Sample 2:** `2 3` with DEPOSIT 1 500, WITHDRAW 1 600, TRANSFER 1 2 100 → `400 / 100`. The "
            "withdrawal of 600 is ignored (balance was only 500); the transfer of 100 then succeeds."
        ),
        constraints="1 ≤ N ≤ 1000  \n1 ≤ Q ≤ 1000  \n1 ≤ amt ≤ 10^6",
        samples=[("3 5\nDEPOSIT 1 100\nDEPOSIT 2 50\nTRANSFER 1 2 30\nWITHDRAW 2 20\nWITHDRAW 3 10", "70\n60\n0"),
                 ("2 3\nDEPOSIT 1 500\nWITHDRAW 1 600\nTRANSFER 1 2 100", "400\n100")],
        direct=[("1 1\nDEPOSIT 1 1000000", "1000000"), ("1 1\nWITHDRAW 1 50", "0")],
        hidden=[("2 4\nDEPOSIT 1 100\nDEPOSIT 2 100\nTRANSFER 1 2 50\nTRANSFER 2 1 200", "50\n150"),
                ("3 6\nDEPOSIT 1 10\nDEPOSIT 2 20\nDEPOSIT 3 30\nWITHDRAW 1 5\nWITHDRAW 2 25\nTRANSFER 3 1 10", "15\n20\n20"),
                ("1 3\nDEPOSIT 1 100\nWITHDRAW 1 100\nWITHDRAW 1 1", "0"),
                ("4 2\nDEPOSIT 4 999999\nDEPOSIT 2 1", "0\n1\n0\n999999"),
                ("2 5\nDEPOSIT 1 50\nDEPOSIT 2 50\nTRANSFER 1 2 50\nTRANSFER 2 1 100\nTRANSFER 1 2 1", "99\n1")],
    ),
]