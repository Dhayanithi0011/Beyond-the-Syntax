import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { runPythonSource } from "./pythonRunner";
import { runNativeCode } from "./nativeRunner";

/**
 * Demo mode: a fully simulated API surface so the whole UI can be previewed
 * without Postgres / FastAPI / Supabase running.
 *
 * It mirrors the endpoint shapes in docs/API_SPEC.md exactly, so flipping
 * `VITE_DEMO_MODE=false` in the frontend .env switches pages over to the real
 * backend with zero page-code changes.
 *
 * Everything fabricated here is explicitly NOT authoritative — in production
 * the backend owns timers, graders, rankings and access control.
 */

export const isDemoMode = import.meta.env.VITE_DEMO_MODE !== "false";

/* ------------------------------------------------------------------ */
/* Shared demo identity                                               */
/* ------------------------------------------------------------------ */

export const demoParticipant: {
  id: string;
  role: "participant" | "admin";
  name: string;
  participant_code: string;
  email: string;
  department: string;
  year: number;
} = {
  id: "demo-participant",
  role: "participant",
  name: "Aarav Mehta",
  participant_code: "P-1024",
  email: "aarav@college.edu",
  department: "Computer Science",
  year: 3,
};

export const demoAdmin: { id: string; role: "participant" | "admin"; name: string } = {
  id: "demo-admin",
  role: "admin",
  name: "Dr. Sarah Lin",
};

/* ------------------------------------------------------------------ */
/* Timer anchors (computed at module load so countdowns stay live)     */
/* ------------------------------------------------------------------ */

const t0 = Date.now();
const mins = (m: number) => m * 60_000;
const secs = (s: number) => s * 1000;

const quizDeadline = () => new Date(t0 + mins(17) + secs(42)).toISOString();

const member2Deadline = () => new Date(t0 + mins(7) + secs(23)).toISOString();
const teamDeadline = () => new Date(t0 + mins(24) + secs(51)).toISOString();

/* ------------------------------------------------------------------ */
/* Round 1 question bank                                               */
/* ------------------------------------------------------------------ */

const Q = (
  id: string,
  text: string,
  options: [string, string, string, string],
  correct: string,
  category: string,
  difficulty: "easy" | "medium" | "hard",
  marks: number
) => ({ id, text, options, correct, category, difficulty, marks });

export const questionBank = [
  /* C Programming crash-course set added by organizers */
  Q("c1", "#include <stdio.h>\n\nint main() {\n    int age = 20\n    printf(\"%d\", age);\n    return 0;\n}\n\nWhat is the error?", ["Error in printf()", "Missing semicolon after 20", "Error in return", "No error"], "B", "C Programming", "easy", 1),
  Q("c2", "Complete the program to read an integer:\n\n#include <stdio.h>\n\nint main() {\n    int n;\n    _________;\n    return 0;\n}", ["scanf(\"%d\", n)", "scanf(\"%d\", &n)", "scanf(\"%f\", &n)", "input(n)"], "B", "C Programming", "easy", 1),
  Q("c3", "Which is the correct way to declare an integer variable?", ["integer x;", "int x;", "x int;", "Integer x;"], "B", "C Programming", "easy", 1),
  Q("c4", "Which operator is used to find the remainder in C?", ["/", "/ /", "%", "rem"], "C", "C Programming", "easy", 1),
  Q("c5", "Complete the code to check whether a number is positive:\n\nint n = 10;\n\nif (_________)\n    printf(\"Positive\");", ["n < 0", "n == 0", "n > 0", "n != 10"], "C", "C Programming", "easy", 1),
  Q("c6", "Find the error:\n\n#include <stdio.h>\n\nint main() {\n    float marks = 85.5;\n    printf(\"%d\", marks);\n    return 0;\n}\n\nWhat should be changed?", ["%d → %f", "%f → %d", "float → int only", "Nothing"], "A", "C Programming", "medium", 1),
  Q("c7", "Arrange these statements to calculate the sum:\n\nA. printf(\"%d\", sum);\nB. int sum = a + b;\nC. int a = 10, b = 20;", ["A → B → C", "B → C → A", "C → B → A", "C → A → B"], "C", "C Programming", "easy", 1),
  Q("c8", "Which is the correct if statement?", ["if x > 10", "if (x > 10)", "if [x > 10]", "if {x > 10}"], "B", "C Programming", "easy", 1),
  Q("c9", "Complete the loop to print numbers from 1 to 5:\n\nfor(int i = 1; _________; i++)\n{\n    printf(\"%d \", i);\n}", ["i < 5", "i <= 5", "i = 5", "i != 5"], "B", "C Programming", "easy", 1),
  Q("c10", "Which keyword is used to exit a loop immediately?", ["stop", "exit", "break", "continue"], "C", "C Programming", "easy", 1),
  Q("c11", "What is the problem?\n\nint numbers[5];\n\nfor(int i = 0; i <= 5; i++)\n{\n    numbers[i] = i;\n}", ["Array size should be 6", "Loop should start at 1", "Condition should be i < 5", "No error"], "C", "C Programming", "medium", 1),
  Q("c12", "Complete the code to find the larger of two numbers:\n\nint a = 20, b = 15;\nif (_________)\n      printf(\"A is larger\");\nelse\n      printf(\"B is larger\");", ["a < b", "a > b", "a = b", "a == b"], "B", "C Programming", "easy", 1),
  Q("c13", "Arrange the statements to swap two numbers:\n\nA. temp = a;\nB. a = b;\nC. b = temp;", ["A → B → C", "B → C → A", "C → A → B", "B → A → C"], "A", "C Programming", "easy", 1),
  Q("c14", "Which correctly checks whether n is even?", ["if(n / 2 == 0)", "if(n % 2 == 0)", "if(n % 2 == 1)", "if(n * 2 == 0)"], "B", "C Programming", "easy", 1),
  Q("c15", "Complete the code to calculate the sum of array elements:\n\nint a[] = {10, 20, 30};\nint sum = 0;\n\nfor(int i = 0; i < 3; i++)\n{\n    ___________;\n}", ["sum = i;", "sum = a;", "sum = sum + a[i];", "sum = sum + i;"], "C", "C Programming", "easy", 1),
  Q("c16", "What is the issue?\n\nint n = 10;\n\nif(n = 5)\n    printf(\"Five\");", ["= should be ==", "5 should be 10", "if cannot compare numbers", "No error"], "A", "C Programming", "medium", 1),
  Q("c17", "Which statement about arrays is correct?", ["Array indexing starts from 1", "Array indexing starts from 0", "Array indexing starts from -1", "Arrays cannot store integers"], "B", "C Programming", "easy", 1),
  Q("c18", "Complete the function:\n\nint add(int a, int b)\n{\n       _________;\n}", ["print a + b;", "return a + b;", "output a + b;", "give a + b;"], "B", "C Programming", "easy", 1),
  Q("c19", "The following program should print numbers from 1 to 5 but contains a bug:\n\nint i = 1;\nwhile(i <= 5)\n{\n          printf(\"%d \", i);\n}\n\nWhat is missing?", ["i = 0;", "i++", "i--;", "break;"], "B", "C Programming", "easy", 1),
  Q("c20", "Which correctly declares a character variable containing A?", ["char ch = \"A\";", "char ch = 'A';", "character ch = A;", "char ch = A;"], "B", "C Programming", "easy", 1),
  Q("c21", "Arrange the statements to calculate factorial:\n\nA. fact = fact * i;\nB. int fact = 1;\nC. for(i = 1; i <= n; i++)\nD. printf(\"%d\", fact);", ["B → C → A → D", "C → B → A → D", "B → A → C → D", "A → B → C → D"], "A", "C Programming", "easy", 1),
  Q("c22", "Which condition correctly checks whether a person is eligible if age must be 18 or above?\n\nif(_________)\n    printf(\"Eligible\");", ["age > 18", "age < 18", "age >= 18", "age == 18"], "C", "C Programming", "easy", 1),
  Q("c23", "What is the main problem?\n\n#include <stdio.h>\n\nint main()\n{\n    int *p;\n    *p = 10;\n\n    printf(\"%d\", *p);\n\n    return 0;\n}", ["Pointer cannot store integers", "p is not initialized to a valid memory address", "printf() cannot print pointers", "int *p is invalid"], "B", "C Programming", "hard", 1),
  Q("c24", "Complete the code to access the third element using a pointer:\n\nint a[] = {10, 20, 30, 40};\nint *p = a;\n\nprintf(\"%d\", ___________);", ["*p", "*(p + 1)", "*(p + 2)", "*(p + 3)"], "C", "C Programming", "medium", 1),
  Q("c25", "The program should count how many elements are greater than 10:\n\nint a[] = {5, 15, 20, 8};\nint count = 0;\n\nfor(int i = 0; i < 4; i++)\n{\n    if(a[i] > 10);\n        count++;\n}\n\nWhat is the bug?", ["Array declaration is wrong", "count should be initialized to 1", "Extra semicolon after if", "i should start from 1"], "C", "C Programming", "hard", 1),
  Q("c26", "Arrange the following to find the largest element in an array:\n\nA. if(a[i] > max)\n       max = a[i];\n\nB. int max = a[0];\n\nC. for(int i = 1; i < n; i++)\n\nD. printf(\"%d\", max);", ["B → C → A → D", "C → B → A → D", "B → A → C → D", "A → B → C → D"], "A", "C Programming", "easy", 1),
  Q("c27", "Which correctly defines a function that receives an integer and returns its square?\n\nA. int square(int n) { return n * n; }\nB. square(int n) { print n * n; }\nC. function square(n) { return n*n; }\nD. int square() { return n * n; }", ["B", "C", "A", "D"], "C", "C Programming", "medium", 1),
  Q("c28", "Complete the recursive factorial function:\n\nint factorial(int n)\n{\n    if(n == 0)\n        return 1;\n\n    return ___________;\n}", ["n + factorial(n)", "n * factorial(n - 1)", "n * factorial(n + 1)", "factorial(n)"], "B", "C Programming", "medium", 1),
  Q("c29", "The following function is intended to modify the original variable:\n\nvoid change(int x)\n{\n    x = 100;\n}\n\nint main()\n{\n    int a = 10;\n    change(a);\n    printf(\"%d\", a);\n}\n\nWhat should be changed so that a becomes 100?", ["Use a pointer parameter", "Make x a float", "Use static", "Add return 100"], "A", "C Programming", "hard", 1),
  Q("c30", "Complete the code to reverse an integer using a loop:\n\nint n = 123;\nint rev = 0;\n\nwhile(n > 0)\n{\n    int digit = n % 10;\n    rev = ___________;\n    n = n / 10;\n}", ["rev + digit", "rev * 10 + digit", "rev / 10 + digit", "digit + 10"], "B", "C Programming", "medium", 1),
];

export type DemoQuestion = {
  question_id: string;
  text: string;
  options: { label: string; text: string }[];
  marks: number;
  category: string;
};

const pickOrder = <T,>(arr: T[]): T[] => arr.map((v) => ({ v, k: Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.v);

const LABELS = ["A", "B", "C", "D"] as const;

function buildRandomizedQuestions(): DemoQuestion[] {
  /* Question ORDER is shuffled AND each participant's option CONTENT is
   * shuffled. Labels A → D are assigned AFTER the shuffle, so rows always
   * render linearly top-to-bottom while the content under each letter varies
   * per participant. The letter that maps to the correct answer therefore
   * differs per attempt — that's the anti-cheat property (sharing keys won't
   * match). The letter→correct mapping is kept server-side only
   * (store.quiz.correct_labels) and never serialized to the browser. */
  return pickOrder(questionBank).map((q) => {
    const shuffledContent = pickOrder(q.options);
    const correctIndex = LABELS.indexOf(q.correct as (typeof LABELS)[number]);
    const correctLabel = LABELS[shuffledContent.indexOf(q.options[correctIndex])];
    store.quiz.correct_labels[q.id] = correctLabel;
    return {
      question_id: q.id,
      text: q.text,
      marks: q.marks,
      category: q.category,
      options: LABELS.map((label, i) => ({ label, text: shuffledContent[i] })),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Round 2 coding problems                                             */
/* ------------------------------------------------------------------ */

/* Generic per-language skeletons — every problem starts with a fresh,
   stdin-driven template (the judge only cares about printed stdout). */
export const GENERIC_STARTERS: Record<string, string> = {
  c: `#include <stdio.h>

int main() {
    // Read input from stdin, compute the answer, print it
    return 0;
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // Read input from stdin, compute the answer, print it
    return 0;
}
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        // Read input from stdin, compute the answer, print it
    }
}
`,
  python: `import sys

def main():
    data = sys.stdin.read().split()
    # Parse input from data, compute the answer, print it

if __name__ == "__main__":
    main()
`,
};

type ProblemTestCase = { input: string; expected_output: string };

type ContestProblem = {
  id: string;
  title: string;
  domain: string;
  difficulty: "easy" | "intermediate";
  max_score: number;
  time_limit_ms: number;
  memory_limit_mb: number;
  statement_md: string;
  constraints_md: string;
  sample_cases: ProblemTestCase[];
  test_cases: ProblemTestCase[];
  hidden_cases: ProblemTestCase[];
};

/* Sets are labelled "SET 1..10". Each team is assigned one set (round-robin:
   all 10 sets are handed out before any set repeats; repeats only begin on
   the 3rd round). Hidden test cases never leave the server. */
const P = (
  id: string,
  title: string,
  domain: string,
  difficulty: "easy" | "intermediate",
  maxScore: number,
  statement: string,
  inputFormat: string,
  outputFormat: string,
  constraints: string,
  samples: [string, string][],
  tests: [string, string][],
  hidden: [string, string][]
): ContestProblem => ({
  id,
  title,
  domain,
  difficulty,
  max_score: maxScore,
  time_limit_ms: 2000,
  memory_limit_mb: 256,
  statement_md: `${statement}\n\n**Input Format**\n\n${inputFormat}\n\n**Output Format**\n\n${outputFormat}`,
  constraints_md: constraints,
  sample_cases: samples.map(([input, expected_output]) => ({ input: input.trim(), expected_output: expected_output.trim() + "\n" })),
  test_cases: tests.map(([input, expected_output]) => ({ input: input.trim(), expected_output: expected_output.trim() + "\n" })),
  hidden_cases: hidden.map(([input, expected_output]) => ({ input: input.trim(), expected_output: expected_output.trim() + "\n" })),
});

export const problemSets: { id: string; topic: string; questions: ContestProblem[] }[] = [
  {
    id: "set-1",
    topic: "Arrays · Strings · DP",
    questions: [
      P(
        "set1-q1", "Second Largest Distinct Element", "Arrays", "easy", 100,
        "Given an array of `N` integers, find the **second largest distinct** element in the array. If no such element exists (for example, when every element is the same), print `-1`.",
        "Line 1: an integer `N`.\nLine 2: `N` space-separated integers `A[1..N]`.",
        "A single integer: the second largest distinct value, or `-1` if it does not exist.",
        "- `1 <= N <= 10^5`\n- `-10^9 <= A[i] <= 10^9`",
        [["5\n12 35 1 10 34", "34"], ["3\n10 10 10", "-1"]],
        [["6\n5 5 5 6 6 7", "6"], ["4\n-1 -2 -3 -4", "-2"]],
        [["1\n5", "-1"], ["5\n100 90 90 80 100", "90"], ["2\n7 7", "-1"], ["7\n1 2 3 4 5 6 7", "6"], ["4\n1000000000 -1000000000 999999999 1000000000", "999999999"]]
      ),
      P(
        "set1-q2", "String Compression (RLE)", "Strings", "intermediate", 200,
        "Given a string `S` of uppercase English letters, compress it using run-length encoding: replace every run of consecutive repeating characters with the character followed by the run's count (omit the count when it is `1`). If the compressed string is **not strictly shorter** than the original string, output the original string instead.",
        "A single line containing the string `S`.",
        "The compressed string, or the original string if compression does not shorten it.",
        "- `1 <= |S| <= 10^5`\n- `S` contains only uppercase English letters.",
        [["AAABBBCCDAA", "A3B3C2DA2"], ["ABCD", "ABCD"]],
        [["AABBCC", "AABBCC"], ["AAAAAAAAAA", "A10"]],
        [["Z", "Z"], ["AABBBAA", "A2B3A2"], ["ABABAB", "ABABAB"], ["WWWWWWWWWWWWWWWWWWWW", "W20"], ["PPQQQRRRRS", "P2Q3R4S"]]
      ),
      P(
        "set1-q3", "House Robber", "DP", "intermediate", 200,
        "Houses are arranged in a line; house `i` contains `A[i]` amount of money. A thief cannot rob two **adjacent** houses (doing so triggers an alarm). Find the maximum total amount the thief can rob.",
        "Line 1: an integer `N`.\nLine 2: `N` space-separated non-negative integers `A[1..N]`.",
        "A single integer: the maximum amount that can be robbed.",
        "- `1 <= N <= 10^5`\n- `0 <= A[i] <= 10^4`",
        [["4\n1 2 3 1", "4"], ["5\n2 7 9 3 1", "12"]],
        [["1\n5", "5"], ["2\n5 10", "10"]],
        [["3\n5 1 1", "6"], ["6\n5 5 10 100 10 5", "110"], ["1\n0", "0"], ["4\n0 0 0 0", "0"], ["7\n2 1 1 2 100 3 1", "104"]]
      ),
    ],
  },
  {
    id: "set-2",
    topic: "Recursion · Graphs · Greedy",
    questions: [
      P(
        "set2-q1", "Digital Root (Recursive)", "Recursion", "easy", 100,
        "Given a non-negative integer `N`, find its digital root: repeatedly sum the digits of `N` until a single digit remains. You must implement the *repeat until a single digit remains* logic using a **recursive** function.",
        "A single integer `N`.",
        "A single digit (`0-9`): the digital root of `N`.",
        "- `0 <= N <= 10^18`",
        [["12345", "6"], ["9875", "2"]],
        [["0", "0"], ["9", "9"]],
        [["99999", "9"], ["123456789", "9"], ["1000000000000000000", "1"], ["55", "1"], ["48", "3"]]
      ),
      P(
        "set2-q2", "Number of Islands", "Graphs", "intermediate", 200,
        "Given an `M x N` grid of `'0'`s (water) and `'1'`s (land), count the number of islands. An island is formed by connecting adjacent lands horizontally or vertically and is surrounded entirely by water.",
        "Line 1: two integers `M` and `N`.\nNext `M` lines: a string of `N` characters (`'0'` or `'1'`) each.",
        "A single integer: the number of islands.",
        "- `1 <= M, N <= 300`",
        [["4 5\n11000\n11000\n00100\n00011", "3"], ["3 3\n111\n111\n111", "1"]],
        [["1 1\n0", "0"], ["1 1\n1", "1"]],
        [["2 2\n10\n01", "2"], ["5 5\n00000\n01010\n00000\n01010\n00000", "4"], ["3 4\n1111\n0000\n1111", "2"], ["4 4\n1100\n1100\n0011\n0011", "2"], ["6 6\n000000\n000000\n000000\n000000\n000000\n000000", "0"]]
      ),
      P(
        "set2-q3", "Maximum Non-Overlapping Meetings", "Greedy", "intermediate", 200,
        "Given `N` meetings, each with a start and end time, select the maximum number of meetings a single person can attend such that no two selected meetings overlap. A meeting may start exactly when another one ends.",
        "Line 1: an integer `N`.\nNext `N` lines: two integers `start` and `end`.",
        "A single integer: the maximum number of meetings that can be attended.",
        "- `1 <= N <= 10^5`\n- `0 <= start < end <= 10^9`",
        [["6\n1 2\n3 4\n0 6\n5 7\n8 9\n5 9", "4"], ["3\n10 20\n12 25\n20 30", "2"]],
        [["1\n5 10", "1"], ["2\n1 10\n2 3", "1"]],
        [["4\n1 3\n2 4\n3 5\n4 6", "2"], ["5\n1 2\n2 3\n3 4\n4 5\n5 6", "5"], ["3\n1 100\n2 3\n4 5", "2"], ["1\n0 1000000000", "1"], ["7\n1 4\n2 5\n3 6\n5 7\n6 8\n7 9\n8 10", "3"]]
      ),
    ],
  },
  {
    id: "set-3",
    topic: "Math · Sorting · Stacks",
    questions: [
      P(
        "set3-q1", "GCD and LCM", "Math", "easy", 100,
        "Given two positive integers `A` and `B`, compute their Greatest Common Divisor (GCD) and Least Common Multiple (LCM).",
        "A single line with two integers `A` and `B`.",
        "Two space-separated integers: GCD and LCM.",
        "- `1 <= A, B <= 10^9`",
        [["12 18", "6 36"], ["7 13", "1 91"]],
        [["100 100", "100 100"], ["1 999999937", "1 999999937"]],
        [["24 36", "12 72"], ["17 34", "17 34"], ["1000000000 999999999", "1 999999999000000000"], ["9 28", "1 252"], ["60 48", "12 240"]]
      ),
      P(
        "set3-q2", "Kth Smallest Element", "Searching & Sorting", "intermediate", 200,
        "Given an unsorted array of `N` distinct integers and an integer `K`, find the `K`th smallest element of the array.",
        "Line 1: two integers `N` and `K`.\nLine 2: `N` space-separated integers.",
        "A single integer: the `K`th smallest element.",
        "- `1 <= K <= N <= 10^5`",
        [["6 3\n7 10 4 3 20 15", "7"], ["5 1\n5 4 3 2 1", "1"]],
        [["1 1\n42", "42"], ["4 4\n1 2 3 4", "4"]],
        [["7 4\n1 23 12 9 30 2 50", "12"], ["5 2\n-5 -1 -10 3 0", "-5"], ["10 10\n10 9 8 7 6 5 4 3 2 1", "10"], ["3 2\n100 50 75", "75"], ["6 5\n1000000000 -1000000000 0 500 -500 999999999", "999999999"]]
      ),
      P(
        "set3-q3", "Balanced Parentheses", "Stacks & Queues", "intermediate", 200,
        "Given a string containing only the characters `'('`, `')'`, `'{'`, `'}'`, `'['` and `']'`, determine whether the string is valid: every opening bracket must be closed by the same type of bracket, and brackets must close in the correct order.",
        "A single line containing the string `S`.",
        "`YES` if the string is valid, otherwise `NO`.",
        "- `1 <= |S| <= 10^5`",
        [["{[()()]}", "YES"], ["{[(])}", "NO"]],
        [["()", "YES"], ["(", "NO"]],
        [["([{}])", "YES"], [")(", "NO"], ["{{{{}}}}", "YES"], ["[({)}]", "NO"], ["[]", "YES"]]
      ),
    ],
  },
  {
    id: "set-4",
    topic: "Hashing · Trees · Backtracking",
    questions: [
      P(
        "set4-q1", "First Non-Repeating Character", "Hashing", "easy", 100,
        "Given a string `S` of lowercase English letters, find the first character that does not repeat anywhere else in the string. If every character repeats, print `-1`.",
        "A single line containing the string `S`.",
        "The first non-repeating character, or `-1` if none exists.",
        "- `1 <= |S| <= 10^5`",
        [["swiss", "w"], ["aabbcc", "-1"]],
        [["z", "z"], ["aabbc", "c"]],
        [["teeter", "r"], ["xxyyzz", "-1"], ["abcabcde", "d"], ["aabbccdde", "e"], ["mississippi", "m"]]
      ),
      P(
        "set4-q2", "BST Level Order Traversal", "Trees", "intermediate", 200,
        "You are given `N` distinct integers. Insert them one by one, in the given order, into an initially empty Binary Search Tree using standard BST insertion rules. Print the **level-order** (breadth-first) traversal of the resulting tree.",
        "Line 1: an integer `N`.\nLine 2: `N` space-separated distinct integers (insertion order).",
        "A single line: the level-order traversal, space-separated.",
        "- `1 <= N <= 1000`",
        [["7\n50 30 70 20 40 60 80", "50 30 70 20 40 60 80"], ["4\n10 5 15 1", "10 5 15 1"]],
        [["1\n99", "99"], ["3\n5 3 8", "5 3 8"]],
        [["5\n1 2 3 4 5", "1 2 3 4 5"], ["5\n5 4 3 2 1", "5 4 3 2 1"], ["6\n20 10 30 5 15 25", "20 10 30 5 15 25"], ["2\n100 50", "100 50"], ["8\n8 4 12 2 6 10 14 1", "8 4 12 2 6 10 14 1"]]
      ),
      P(
        "set4-q3", "All Permutations", "Backtracking", "intermediate", 200,
        "Given a string `S` of distinct characters, print all permutations of `S` in lexicographically sorted order, one permutation per line.",
        "A single line containing the string `S` (distinct uppercase letters).",
        "All permutations of `S`, one per line, in lexicographic order.",
        "- `1 <= |S| <= 7`",
        [["AB", "AB\nBA"], ["A", "A"]],
        [["XY", "XY\nYX"], ["ABC", "ABC\nACB\nBAC\nBCA\nCAB\nCBA"]],
        [["Z", "Z"], ["PQ", "PQ\nQP"], ["MNO", "MNO\nMON\nNMO\nNOM\nOMN\nONM"], ["DEF", "DEF\nDFE\nEDF\nEFD\nFDE\nFED"], ["AC", "AC\nCA"]]
      ),
    ],
  },
  {
    id: "set-5",
    topic: "Sliding Window · Bit Manipulation · Simulation",
    questions: [
      P(
        "set5-q1", "Maximum Sum Subarray of Size K", "Sliding Window", "easy", 100,
        "Given an array of `N` integers and an integer `K`, find the maximum sum of any contiguous subarray of size exactly `K`.",
        "Line 1: two integers `N` and `K`.\nLine 2: `N` space-separated integers.",
        "A single integer: the maximum sum among all windows of size `K`.",
        "- `1 <= K <= N <= 10^5`",
        [["8 3\n2 1 5 1 3 2 1 4", "9"], ["5 5\n1 2 3 4 5", "15"]],
        [["4 1\n5 1 9 2", "9"], ["3 2\n-1 -2 -3", "-3"]],
        [["6 2\n4 2 1 7 8 1", "15"], ["5 3\n100 200 300 400 500", "1200"], ["1 1\n7", "7"], ["7 4\n1 4 2 10 2 3 1", "18"], ["10 5\n1 -1 1 -1 1 -1 1 -1 1 -1", "1"]]
      ),
      P(
        "set5-q2", "Single Number (XOR)", "Bit Manipulation", "intermediate", 200,
        "Given an array in which every element appears exactly twice except for one element that appears exactly once, find that unique element. Your solution should run in `O(N)` time using `O(1)` extra space (use the XOR bitwise operator).",
        "Line 1: an integer `N` (`N` is odd).\nLine 2: `N` space-separated integers.",
        "A single integer: the element that appears only once.",
        "- `1 <= N <= 10^5`\n- `N` is odd",
        [["5\n4 1 2 1 2", "4"], ["1\n99", "99"]],
        [["3\n1 1 5", "5"], ["7\n10 20 10 30 20 40 30", "40"]],
        [["5\n-1 -1 -2 -3 -2", "-3"], ["9\n5 5 6 6 7 7 8 8 9", "9"], ["3\n0 1 1", "0"], ["11\n2 2 3 3 4 4 5 5 6 6 100", "100"], ["1\n-500", "-500"]]
      ),
      P(
        "set5-q3", "Round Robin Average Waiting Time", "Simulation", "intermediate", 200,
        "`N` processes arrive at time 0 (in the given order) with given burst times. Using Round Robin CPU scheduling with time quantum `Q` (processes not finished within a quantum are placed at the back of the ready queue), compute the **average waiting time** of all processes. Print the answer rounded to exactly 2 decimal places.",
        "Line 1: two integers `N` and `Q`.\nLine 2: `N` space-separated burst times.",
        "A single value: the average waiting time, rounded to 2 decimal places.",
        "- `1 <= N <= 1000`\n- `1 <= Q <= 1000`\n- `1 <= burst time <= 1000`",
        [["3 4\n24 3 3", "5.67"], ["2 2\n2 4", "1.00"]],
        [["1 5\n10", "0.00"], ["2 1\n1 1", "0.50"]],
        [["4 2\n5 4 2 1", "6.00"], ["3 3\n3 3 3", "3.00"], ["1 1\n1", "0.00"], ["5 10\n7 7 7 7 7", "14.00"], ["2 100\n50 50", "25.00"]]
      ),
    ],
  },
  {
    id: "set-6",
    topic: "Arrays · Strings · DP",
    questions: [
      P(
        "set6-q1", "Rotate Array Left by D", "Arrays", "easy", 100,
        "Given an array of `N` integers, rotate it to the left by `D` positions (`D` may exceed `N`; use `D mod N`).",
        "Line 1: two integers `N` and `D`.\nLine 2: `N` space-separated integers.",
        "The rotated array, space-separated, on a single line.",
        "- `1 <= N <= 10^5`\n- `0 <= D <= 10^9`",
        [["5 2\n1 2 3 4 5", "3 4 5 1 2"], ["4 0\n10 20 30 40", "10 20 30 40"]],
        [["3 1\n7 8 9", "8 9 7"], ["5 5\n1 2 3 4 5", "1 2 3 4 5"]],
        [["6 7\n1 2 3 4 5 6", "2 3 4 5 6 1"], ["1 100\n42", "42"], ["4 3\n-1 -2 -3 -4", "-4 -1 -2 -3"], ["7 10\n1 2 3 4 5 6 7", "4 5 6 7 1 2 3"], ["2 1\n100 200", "200 100"]]
      ),
      P(
        "set6-q2", "Longest Palindromic Substring", "Strings", "intermediate", 200,
        "Given a string `S`, find the length of the longest substring of `S` that is a palindrome.",
        "A single line containing the string `S`.",
        "A single integer: the length of the longest palindromic substring.",
        "- `1 <= |S| <= 5000`",
        [["babad", "3"], ["cbbd", "2"]],
        [["a", "1"], ["aaaa", "4"]],
        [["abccba", "6"], ["abcde", "1"], ["racecarxyz", "7"], ["forgeeksskeegfor", "10"], ["xyzzyx", "6"]]
      ),
      P(
        "set6-q3", "Climbing Stairs (1/2/3 Steps)", "DP", "intermediate", 200,
        "A staircase has `N` steps. From any step you may climb 1, 2 or 3 steps at a time. Count the number of distinct ways to reach the top (step `N`), starting from step 0. Print the answer modulo `1000000007`.",
        "A single integer `N`.",
        "The number of distinct ways, modulo `1000000007`.",
        "- `0 <= N <= 10^6`",
        [["4", "7"], ["1", "1"]],
        [["0", "1"], ["3", "4"]],
        [["2", "2"], ["5", "13"], ["10", "274"], ["6", "24"], ["8", "81"]]
      ),
    ],
  },
  {
    id: "set-7",
    topic: "Recursion · Graphs · Greedy",
    questions: [
      P(
        "set7-q1", "Recursive Fast Exponentiation", "Recursion", "easy", 100,
        "Given a base `X` and a non-negative exponent `N`, compute `(X^N) mod 1000000007` using a **recursive** divide-and-conquer fast exponentiation algorithm that runs in `O(log N)` time.",
        "A single line with two integers `X` and `N`.",
        "A single integer: `(X^N) mod 1000000007`.",
        "- `1 <= X <= 10^9`\n- `0 <= N <= 10^9`",
        [["2 10", "1024"], ["5 0", "1"]],
        [["3 3", "27"], ["1 1000000000", "1"]],
        [["2 30", "73741817"], ["10 9", "1000000000"], ["7 2", "49"], ["999999999 1", "999999999"], ["2 0", "1"]]
      ),
      P(
        "set7-q2", "Detect Cycle in Undirected Graph", "Graphs", "intermediate", 200,
        "Given an undirected graph with `V` vertices (0-indexed) and `E` edges, determine whether the graph contains at least one cycle.",
        "Line 1: two integers `V` and `E`.\nNext `E` lines: two integers `u` and `v` denoting an edge between `u` and `v`.",
        "`YES` if the graph contains a cycle, otherwise `NO`.",
        "- `1 <= V <= 10^5`\n- `0 <= E <= 10^5`",
        [["5 5\n0 1\n1 2\n2 3\n3 4\n4 0", "YES"], ["4 3\n0 1\n1 2\n2 3", "NO"]],
        [["1 0", "NO"], ["3 3\n0 1\n1 2\n2 0", "YES"]],
        [["6 4\n0 1\n1 2\n3 4\n4 5", "NO"], ["6 5\n0 1\n1 2\n3 4\n4 5\n2 0", "YES"], ["2 1\n0 1", "NO"], ["7 7\n0 1\n1 2\n2 3\n3 4\n4 5\n5 6\n6 0", "YES"], ["5 0", "NO"]]
      ),
      P(
        "set7-q3", "Minimum Currency Notes", "Greedy", "intermediate", 200,
        "Given an amount `A` (in rupees), find the minimum number of notes/coins needed to pay exactly `A`, using an unlimited supply of denominations `{1, 2, 5, 10, 20, 50, 100, 500, 2000}`. Use the greedy strategy of always using the largest denomination possible.",
        "A single integer `A`.",
        "A single integer: the minimum number of notes/coins required.",
        "- `0 <= A <= 10^9`",
        [["93", "5"], ["0", "0"]],
        [["7", "2"], ["2000", "1"]],
        [["1", "1"], ["2021", "3"], ["999999999", "500012"], ["500", "1"], ["19", "4"]]
      ),
    ],
  },
  {
    id: "set-8",
    topic: "Math · Sorting · Stacks",
    questions: [
      P(
        "set8-q1", "Perfect Number Check", "Math", "easy", 100,
        "A perfect number is a positive integer that equals the sum of its proper divisors (all divisors excluding itself). Given `N`, determine whether it is a perfect number.",
        "A single integer `N`.",
        "`YES` if `N` is a perfect number, otherwise `NO`.",
        "- `1 <= N <= 10^8`",
        [["28", "YES"], ["12", "NO"]],
        [["6", "YES"], ["1", "NO"]],
        [["496", "YES"], ["8128", "YES"], ["100", "NO"], ["33550336", "YES"], ["2", "NO"]]
      ),
      P(
        "set8-q2", "Search in Rotated Sorted Array", "Searching & Sorting", "intermediate", 200,
        "Given a rotated sorted array of `N` distinct integers and a target value, find the 0-based index of the target using an `O(log N)` algorithm. If the target is not present, print `-1`.",
        "Line 1: two integers `N` and `target`.\nLine 2: `N` space-separated integers.",
        "A single integer: the index of the target, or `-1`.",
        "- `1 <= N <= 10^5`",
        [["7 0\n4 5 6 7 0 1 2", "4"], ["7 3\n4 5 6 7 0 1 2", "-1"]],
        [["1 5\n5", "0"], ["1 3\n5", "-1"]],
        [["5 1\n4 5 6 1 2", "3"], ["5 6\n4 5 6 1 2", "2"], ["6 2\n9 12 15 2 5 6", "3"], ["4 4\n1 2 3 4", "3"], ["6 20\n30 40 50 10 15 20", "5"]]
      ),
      P(
        "set8-q3", "Next Greater Element", "Stacks & Queues", "intermediate", 200,
        "Given an array of `N` integers, for every element find its **Next Greater Element** (NGE): the first element to its right that is strictly greater. If no such element exists, its NGE is `-1`.",
        "Line 1: an integer `N`.\nLine 2: `N` space-separated integers.",
        "`N` space-separated integers: the NGE for each array position, in order.",
        "- `1 <= N <= 10^5`",
        [["4\n4 5 2 25", "5 25 25 -1"], ["4\n13 7 6 12", "-1 12 12 -1"]],
        [["1\n10", "-1"], ["3\n1 2 3", "2 3 -1"]],
        [["3\n3 2 1", "-1 -1 -1"], ["5\n1 3 2 4 1", "3 4 4 -1 -1"], ["6\n6 5 4 3 2 1", "-1 -1 -1 -1 -1 -1"], ["2\n5 5", "-1 -1"], ["7\n2 7 3 5 4 6 8", "7 8 5 6 6 8 -1"]]
      ),
    ],
  },
  {
    id: "set-9",
    topic: "Hashing · Trees · Backtracking",
    questions: [
      P(
        "set9-q1", "Count Pairs With Given Sum", "Hashing", "easy", 100,
        "Given an array of `N` integers and a target sum `K`, count the number of index pairs `(i, j)` with `i < j` such that `A[i] + A[j] = K`.",
        "Line 1: two integers `N` and `K`.\nLine 2: `N` space-separated integers.",
        "A single integer: the number of qualifying pairs.",
        "- `1 <= N <= 10^5`",
        [["5 6\n1 5 7 -1 5", "3"], ["4 8\n1 2 3 4", "0"]],
        [["2 4\n2 2", "1"], ["1 5\n5", "0"]],
        [["6 10\n5 5 5 5 5 5", "15"], ["5 0\n-2 2 -1 1 0", "2"], ["3 100\n1 2 3", "0"], ["4 5\n2 3 2 3", "4"], ["7 14\n7 7 7 7 7 7 7", "21"]]
      ),
      P(
        "set9-q2", "LCA in BST", "Trees", "intermediate", 200,
        "A Binary Search Tree is built by inserting `N` distinct integers in the given order. Given two values `P` and `Q` known to exist in the tree, find their **Lowest Common Ancestor** (LCA).",
        "Line 1: an integer `N`.\nLine 2: `N` space-separated integers (BST insertion order).\nLine 3: two integers `P` and `Q`.",
        "A single integer: the value at the LCA node.",
        "- `1 <= N <= 1000`\n- `P != Q`, and both values exist in the tree.",
        [["7\n50 30 70 20 40 60 80\n20 40", "30"], ["7\n50 30 70 20 40 60 80\n20 80", "50"]],
        [["3\n5 3 8\n3 8", "5"], ["3\n5 3 8\n5 3", "5"]],
        [["5\n1 2 3 4 5\n1 2", "1"], ["5\n1 2 3 4 5\n4 5", "4"], ["6\n20 10 30 5 15 25\n5 15", "10"], ["6\n20 10 30 5 15 25\n5 25", "20"], ["8\n8 4 12 2 6 10 14 1\n1 6", "4"]]
      ),
      P(
        "set9-q3", "N-Queens Count", "Backtracking", "intermediate", 200,
        "Given an integer `N`, find the total number of distinct ways to place `N` non-attacking queens on an `N x N` chessboard (no two queens share a row, column, or diagonal).",
        "A single integer `N`.",
        "A single integer: the total number of valid arrangements.",
        "- `1 <= N <= 12`",
        [["4", "2"], ["1", "1"]],
        [["2", "0"], ["8", "92"]],
        [["3", "0"], ["5", "10"], ["6", "4"], ["7", "40"], ["9", "352"]]
      ),
    ],
  },
  {
    id: "set-10",
    topic: "Sliding Window · Bit Manipulation · Simulation",
    questions: [
      P(
        "set10-q1", "Minimum Subarray Length", "Sliding Window", "easy", 100,
        "Given an array of `N` positive integers and a target sum `S`, find the length of the smallest contiguous subarray whose sum is greater than or equal to `S`. If no such subarray exists, print `0`.",
        "Line 1: two integers `N` and `S`.\nLine 2: `N` space-separated positive integers.",
        "A single integer: the minimum length, or `0` if no subarray qualifies.",
        "- `1 <= N <= 10^5`\n- all array values are positive",
        [["6 7\n2 3 1 2 4 3", "2"], ["3 100\n1 2 3", "0"]],
        [["1 5\n5", "1"], ["1 6\n5", "0"]],
        [["5 11\n1 2 3 4 5", "3"], ["8 15\n5 1 3 5 10 7 4 9", "2"], ["4 4\n1 4 4 4", "1"], ["5 1\n1 1 1 1 1", "1"], ["5 20\n1 2 3 4 5", "0"]]
      ),
      P(
        "set10-q2", "Count Set Bits 1 to N", "Bit Manipulation", "intermediate", 200,
        "Given a positive integer `N`, count the total number of set bits (1s) across the binary representations of every integer from 1 to `N` (inclusive).",
        "A single integer `N`.",
        "A single integer: the total count of set bits.",
        "- `1 <= N <= 10^9`",
        [["4", "5"], ["7", "12"]],
        [["1", "1"], ["8", "13"]],
        [["10", "17"], ["15", "32"], ["16", "33"], ["2", "2"], ["9", "15"]]
      ),
      P(
        "set10-q3", "Bank Account Simulation", "Simulation", "intermediate", 200,
        "There are `N` bank accounts, numbered `1` to `N`, all starting with a balance of 0. Process `Q` operations:\n- `DEPOSIT acc amt` — add `amt` to account `acc`'s balance.\n- `WITHDRAW acc amt` — subtract `amt` from account `acc`'s balance if it has sufficient funds; otherwise the operation is ignored.\n- `TRANSFER acc1 acc2 amt` — move `amt` from `acc1` to `acc2` if `acc1` has sufficient funds; otherwise the operation is ignored.\nAfter processing all operations, print the final balance of every account from 1 to N, one per line.",
        "Line 1: two integers `N` and `Q`.\nNext `Q` lines: one operation each.",
        "`N` lines: the final balance of accounts 1 through N, in order.",
        "- `1 <= N <= 1000`\n- `1 <= Q <= 1000`\n- `1 <= amt <= 10^6`",
        [
          ["3 5\nDEPOSIT 1 100\nDEPOSIT 2 50\nTRANSFER 1 2 30\nWITHDRAW 2 20\nWITHDRAW 3 10", "70\n60\n0"],
          ["2 3\nDEPOSIT 1 500\nWITHDRAW 1 600\nTRANSFER 1 2 100", "400\n100"],
        ],
        [
          ["1 1\nDEPOSIT 1 1000000", "1000000"],
          ["1 1\nWITHDRAW 1 50", "0"],
        ],
        [
          ["2 4\nDEPOSIT 1 100\nDEPOSIT 2 100\nTRANSFER 1 2 50\nTRANSFER 2 1 200", "50\n150"],
          ["3 6\nDEPOSIT 1 10\nDEPOSIT 2 20\nDEPOSIT 3 30\nWITHDRAW 1 5\nWITHDRAW 2 25\nTRANSFER 3 1 10", "15\n20\n20"],
          ["1 3\nDEPOSIT 1 100\nWITHDRAW 1 100\nWITHDRAW 1 1", "0"],
          ["4 2\nDEPOSIT 4 999999\nDEPOSIT 2 1", "0\n1\n0\n999999"],
          ["2 5\nDEPOSIT 1 50\nDEPOSIT 2 50\nTRANSFER 1 2 50\nTRANSFER 2 1 100\nTRANSFER 1 2 1", "99\n1"],
        ]
      ),
    ],
  },
];

/* Set assignment: fixed shuffled order at server load; a team's set index is
   its rank mod 10 — so the first 10 teams cover all 10 sets, repeats only on
   the 3rd round (team 11 = round 3) as requested. */
const SET_ORDER: number[] = (() => {
  const base = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base;
})();

function teamRank(teamId: string): number {
  const m = teamId.match(/^team-(\d+)$/);
  if (!m) return 0;
  /* workspaces use team-0; real teams are 1..N — map both into 0..9 */
  return Math.max(parseInt(m[1], 10) - 1, 0);
}

function assignedSet(teamId: string) {
  return problemSets[SET_ORDER[teamRank(teamId) % SET_ORDER.length]];
}

function findProblem(problemId: string): { problem: ContestProblem; position: number } | null {
  for (const set of problemSets) {
    const i = set.questions.findIndex((q) => q.id === problemId);
    if (i >= 0) return { problem: set.questions[i], position: i + 1 };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

function randomTeamTime(): number {
  return 20 * 60 + Math.floor(Math.random() * 600);
}

function makeTeams() {
  const TEAMS = [
    ["Team Phoenix", "#F59E0B", "Utsav Patel", "Mira Shah", "Kabir Rao"],
    ["Team Volt", "#22C55E", "Naina Iyer", "Rohit Menon", "Diya Kapoor"],
    ["Team Quantum", "#6366F1", "Arjun Nair", "Sana Joshi", "Vikram Bhatt"],
    ["Team Zero", "#A78BFA", "Kritika Das", "Harsh Gupta", "Ananya Pillai"],
    ["Team Ember", "#F97316", "Tanvi Kulkarni", "Imran Sheikh", "Pooja Verma"],
    ["Team Nimbus", "#38BDF8", "Dev Agarwal", "Ritika Jain", "Yash Thakur"],
  ];
  return TEAMS.map(([name, color, m1, m2, m3], i) => {
    const status = i < 2 ? "active" : i === 2 ? "paused" : i === 3 ? "completed" : i === 4 ? "active" : "pending";
    return {
      id: `team-${i + 1}`,
      name,
      color,
      members: [
        { member_number: 1, name: m1, status: i < 2 ? "completed" : i === 2 ? "expired" : "not_started" },
        { member_number: 2, name: m2, status: i < 2 ? "active" : i === 2 ? "paused" : "not_started" },
        { member_number: 3, name: m3, status: "not_started" },
      ],
      status,
      round2_access: i !== 5,
      score: i === 3 ? 260 : i === 4 ? 180 : i === 5 ? 0 : i < 2 ? Math.floor(Math.random() * 90) + 100 : 90,
      current_member_number: status === "completed" ? 3 : status === "active" ? (i === 4 ? 1 : 2) : status === "paused" ? 2 : 1,
      current_problem: status === "completed" ? "Done" : `Problem ${status === "paused" ? 2 : i === 4 ? 1 : 2}`,
      time_remaining_ms: status === "completed" ? 0 : status === "paused" ? mins(9) + secs(40) : status === "active" ? (i === 4 ? secs(41) + secs(0) : mins(6) + secs(12)) : undefined,
      team_time_seconds: status === "completed" ? randomTeamTime() : undefined,
    };
  });
}

export const store = {
  competition: {
    id: "comp-2026",
    name: "Beyond The Syntax 2026",
    tagline: "Inter-college competitive programming championship",
    state: "round2_active",
    registration_open: false,
    round1_duration_seconds: 1800,
    round2_team_duration_seconds: 1800,
    round2_early_handoff_allowed: true,
    round1_questions: questionBank.length,
    round2_problems: problemSets[0].questions.length,
    opens_at: new Date(t0 - mins(40)).toISOString(),
    round2_ends_at: new Date(t0 + mins(24) + secs(51)).toISOString(),
    participants_accepted: 128,
    colleges: 9,
  },

  quiz: {
    attempt_id: "attempt-demo-1",
    question_order: null as DemoQuestion[] | null,
    correct_labels: {} as Record<string, string>,
    deadline: quizDeadline(),
    started_at: new Date(t0 - mins(2) + secs(18)).toISOString(),
    answers: {} as Record<string, string>,
    marked: new Set<string>(),
    status: "in_progress",
    submitted_at: null as string | null,
    score: null as number | null,
    correct_count: null as number | null,
    incorrect_count: null as number | null,
  },

  team: {
    id: "team-0",
    name: "Team Alpha",
    color: "#6366F1",
    icon: "⚡",
    status: "active",
    round2_access: true,
    current_member_number: 2,
    members: [
      { member_number: 1, name: "Ishaan Verma", participant_code: "P-1001", status: "completed" },
      { member_number: 2, name: "Aarav Mehta", participant_code: "P-1024", status: "active" },
      { member_number: 3, name: "Riya Nair", participant_code: "P-1033", status: "not_started" },
    ],
    session: {
      team_started_at: new Date(t0 - mins(5) + secs(9)).toISOString(),
      team_deadline: teamDeadline(),
      member_started_at: new Date(t0 - mins(2) + secs(37)).toISOString(),
      member_deadline: member2Deadline(),
      status: "active",
    },
  },

  drafts: {} as Record<string, { language: string; source_code: string }>,
  submissions: [] as unknown[],

  adminTeams: makeTeams(),
  adminLive: {
    online_count: 42,
    submitted_count: 8,
    teams_coding: 6,
    teams: [] as unknown[],
  },
};

store.adminLive.teams = makeTeams().map((t, i) => ({
  ...t,
  id: `team-${i + 1}`,
}));

const demoSet = assignedSet("team-0");
const demoQuestions = demoSet.questions;
const demoProblem = demoQuestions[0];
const demoSub = (id: string, status: "accepted" | "wrong_answer" | "tle", execMs: number, scoreFraction: number, sec: number) => ({
  id,
  problem_id: demoProblem.id,
  problem_title: demoProblem.title,
  language: "cpp",
  status,
  execution_time_ms: execMs,
  memory_kb: status === "tle" ? 18220 : 18640,
  score: Math.round(demoProblem.max_score * scoreFraction),
  submitted_at: new Date(t0 - mins(4) + secs(sec)).toISOString(),
});
export const submissionsDemo = [demoSub("s1", "accepted", 842, 1, 12), demoSub("s2", "wrong_answer", 451, 0.4, 44), demoSub("s3", "tle", 2004, 0.1, 30)];

store.submissions = [...submissionsDemo];

/* ------------------------------------------------------------------ */
/* Round 1 demo participants / leaderboard                            */
/* ------------------------------------------------------------------ */

const r1Participants = [
  ["Aarav Mehta", "P-1024", "Computer Science", 3, 18, 20, "in_progress"],
  ["Ishaan Verma", "P-1001", "Information Technology", 3, 19, 20, "submitted"],
  ["Riya Nair", "P-1033", "Computer Science", 2, 17, 20, "submitted"],
  ["Sophia D'Souza", "P-1002", "Electronics", 4, 19, 20, "submitted"],
  ["Kunal Sharma", "P-1003", "Computer Science", 2, 18, 20, "submitted"],
  ["Meera Krishnan", "P-1004", "Information Technology", 3, 16, 20, "submitted"],
  ["Rahul Bose", "P-1005", "Mechanical", 3, 15, 20, "submitted"],
  ["Anika Sen", "P-1006", "Computer Science", 1, 18, 20, "submitted"],
  ["Farhan Qureshi", "P-1007", "Electronics", 2, 14, 20, "submitted"],
  ["Natasha Roy", "P-1008", "Mathematics", 3, 13, 20, "submitted"],
  ["Vivek Anand", "P-1009", "Computer Science", 4, 12, 20, "submitted"],
  ["Divya Menon", "P-1010", "Information Technology", 2, 11, 20, "not_submitted"],
  ["Arjun Malhotra", "P-1011", "Computer Science", 3, 10, 20, "submitted"],
  ["Priya Kaur", "P-1012", "Information Technology", 1, 9, 20, "submitted"],
].map(([name, code, dept, year, score, total, status], i) => ({
  id: `r1-${i + 1}`,
  name: name as string,
  participant_code: code as string,
  department: dept as string,
  year: year as number,
  score: score as number,
  total: total as number,
  status: status as string,
  time_taken_seconds: 420 + i * 47,
  qualification_status: i < 8 ? ("qualified" as const) : i < 12 ? ("pending" as const) : ("not_qualified" as const),
}));

const sortedLeaderboard = [...r1Participants]
  .filter((p) => p.status !== "not_submitted")
  .sort((a, b) => b.score - a.score || a.time_taken_seconds - b.time_taken_seconds)
  .map((p, i) => ({ rank: i + 1, ...p }));

/* ------------------------------------------------------------------ */
/* Mock adapter                                                        */
/* ------------------------------------------------------------------ */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function respond<T>(data: T, status = 200): AxiosResponse {
  return { data, status, statusText: "OK", headers: {}, config: {} as InternalAxiosRequestConfig };
}

function gradeQuiz(): { score: number; correct_count: number; incorrect_count: number } {
  /* Grade against the per-attempt shuffled mapping (correct_labels), never the
   * bank's original letter — the label a participant sees is position-based. */
  const labels = store.quiz.correct_labels ?? {};
  let correct = 0;
  let correctCount = 0;
  for (const q of questionBank) {
    const chosen = store.quiz.answers[q.id];
    if (!chosen) continue;
    if (chosen === labels[q.id]) {
      correct += q.marks;
      correctCount += 1;
    }
  }
  const answered = Object.keys(store.quiz.answers).length;
  return { score: correct, correct_count: correctCount, incorrect_count: answered - correctCount };
}

const VERDICTS = ["accepted", "accepted", "accepted", "wrong_answer", "accepted"];

function normalizeOutput(s?: string): string {
  return (s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export async function demoAdapter(config: AxiosRequestConfig): Promise<AxiosResponse> {
  const url: string = config.url ?? "";
  const method = (config.method ?? "get").toLowerCase();
  const body = config.data ? (typeof config.data === "string" ? JSON.parse(config.data) : config.data) : {};

  await delay(260 + Math.random() * 420);

  /* ----- admin auth ----- */
  if (url === "/auth/me" && method === "get") {
    return respond(store.quiz.status === "submitted" ? demoParticipant : demoParticipant);
  }
  if (url === "/admin/login" && method === "post") {
    if (body.password === "incorrect" || (body.password && body.password.toLowerCase().includes("wrong"))) {
      return Promise.reject({ error: "INVALID_CREDENTIALS", message: "Invalid admin credentials." });
    }
    return respond({ token: "demo-admin-token", user: demoAdmin });
  }

  /* ----- public ----- */
  if (url === "/competition" && method === "get") return respond(store.competition);
  if (url === "/rules" && method === "get") {
    return respond({
      rules: [
        { title: "Eligibility", body: "Open to all enrolled undergraduate students. One registration per participant." },
        { title: "Round 1 — Individual Quiz", body: "A timed technical MCQ round (30 minutes). Each participant receives a randomized question and option order. Questions are auto-submitted when the timer ends." },
        { title: "Qualification", body: "Only top performers, as decided by the organizing committee, qualify for Round 2. The leaderboard ranks by score, then by fastest submission." },
        { title: "Round 2 — Coding Relay", body: "Qualified participants form teams of 3. Each member solves one problem in relay order within a shared team budget of 30 minutes. Members may hand off early." },
        { title: "Fair Play", body: "Collaboration is strictly within your own team and only during your own turn. Browser activity is logged. All grading decisions by the committee are final." },
      ],
    });
  }

  /* ----- Round 1 quiz ----- */
  if (url === "/quiz/start" && method === "post") {
    store.quiz.correct_labels = {};
    store.quiz.question_order = buildRandomizedQuestions();
    store.quiz.answers = {};
    store.quiz.marked = new Set();
    store.quiz.status = "in_progress";
    store.quiz.submitted_at = null;
    store.quiz.score = null;
    return respond({ attempt_id: store.quiz.attempt_id, deadline: store.quiz.deadline });
  }
  if (url === "/quiz/questions" && method === "get") {
    const questions = store.quiz.question_order ?? buildRandomizedQuestions();
    return respond({ questions, deadline: store.quiz.deadline });
  }
  if (url === "/quiz/answer" && method === "post") {
    store.quiz.answers[body.question_id] = body.selected_option;
    return respond(null, 204);
  }
  if (url === "/quiz/submit" && method === "post") {
    if (store.quiz.status !== "in_progress") {
      return Promise.reject({ error: "ALREADY_SUBMITTED", message: "This quiz has already been submitted." });
    }
    const g = gradeQuiz();
    store.quiz.status = "submitted";
    store.quiz.submitted_at = new Date().toISOString();
    store.quiz.score = g.score;
    store.quiz.correct_count = g.correct_count;
    store.quiz.incorrect_count = g.incorrect_count;
    return respond({
      score: g.score,
      total: questionBank.length,
      correct_count: g.correct_count,
      incorrect_count: g.incorrect_count,
      time_taken_seconds: Math.round((Date.now() - new Date(store.quiz.started_at).getTime()) / 1000),
      submitted_at: store.quiz.submitted_at,
    });
  }
  if (url === "/leaderboard/round1" && method === "get") {
    return respond({ entries: sortedLeaderboard, updated_at: new Date().toISOString() });
  }

  /* ----- Round 2 team ----- */
  if (/^\/teams\/[^/]+$/.test(url) && method === "get") {
    return respond({ team: store.team });
  }
  if (/^\/teams\/[^/]+\/handoff$/.test(url) && method === "post") {
    return respond({ ok: true, current_member_number: 3, message: "Handoff successful — Member 3 is now active." });
  }

  /* ----- coding ----- */
  if (url === "/coding/problems" && method === "get") {
    const set = assignedSet(store.team.id);
    return respond({
      set: { id: set.id, topic: set.topic },
      problems: set.questions.map((p, i) => ({
        id: p.id,
        title: p.title,
        position: i + 1,
        domain: p.domain,
        max_score: p.max_score,
        solved: i === 0,
        score: i === 0 ? p.max_score : 0,
      })),
      session: store.team.session,
    });
  }
  const problemMatch = url.match(/^\/coding\/problems\/([\w-]+)$/);
  if (problemMatch && method === "get") {
    const found = findProblem(problemMatch[1]);
    if (!found) return Promise.reject({ error: "NOT_FOUND", message: "Problem not found." });
    const p = found.problem;
    const draft = store.drafts[p.id] ?? { language: "cpp", source_code: GENERIC_STARTERS.cpp };
    return respond({
      problem: {
        id: p.id,
        title: p.title,
        position: found.position,
        domain: p.domain,
        statement_md: p.statement_md,
        constraints_md: p.constraints_md,
        time_limit_ms: p.time_limit_ms,
        memory_limit_mb: p.memory_limit_mb,
        max_score: p.max_score,
        sample_cases: p.sample_cases,
        test_cases: p.test_cases,
      },
      draft: { ...draft, last_edited_by: "Ishaan Verma", updated_at: new Date(t0 - mins(2) + secs(14)).toISOString() },
    });
  }
  const hasSource = (src?: string) => !!src && /\S/.test(src) && !/\bTODO\b/.test(src) && !/\bplaceholder\b/i.test(src);
  if (url === "/coding/save" && method === "post") {
    store.drafts[body.problem_id] = { language: body.language, source_code: body.source_code };
    return respond({ saved_at: new Date().toISOString() });
  }
  if (url === "/coding/run" && method === "post") {
    const found = findProblem(body.problem_id);
    if (!found) return Promise.reject({ error: "NOT_FOUND", message: "Problem not found." });
    /* Sample cases are for understanding only — the judge evaluates the visible test cases. */
    const allVisible = found.problem.test_cases.map((c, i) => ({ label: `Test case ${i + 1}`, input: c.input, expected: c.expected_output }));

    if (!hasSource(body.source_code)) {
      return respond({
        status: "compilation_error",
        stdout: "",
        stderr: `${body.language}:5:1: error: this is a stub — write a real solution to see results`,
        execution_time_ms: 320,
        memory_kb: 18420,
        cases: [],
        judged: "real",
      });
    }

    let status = "accepted";
    let stdout = "";
    let stderr = "";
    let execution_time_ms = 412 + Math.floor(Math.random() * 300);
    const cases: { label: string; input: string; expected: string; actual: string; passed: boolean; error?: string }[] = [];
    /* only Java is genuinely simulated in the demo — C/C++ run under Clang→WASM, Python under Pyodide */
    let simulated = body.language === "java";

    if (body.language === "c" || body.language === "cpp") {
      const res = await runNativeCode(body.language, body.source_code, allVisible.map((c) => ({ input: c.input, expected: c.expected })));
      if (res.runtimeUnavailable) {
        simulated = true;
      } else if (res.compileError) {
        return respond({
          status: "compilation_error",
          stdout: "",
          stderr: res.compileError,
          execution_time_ms: res.compile_ms ?? 0,
          memory_kb: 18420,
          cases: [],
          judged: "real",
        });
      } else {
        res.outcomes.forEach((o, i) => {
          const c = allVisible[i];
          stdout += o.actual ?? "";
          if (o.error) {
            status = "wrong_answer";
            stderr = o.error;
            cases.push({ ...c, actual: o.actual ?? "", passed: false, error: o.error });
          } else {
            const passed = normalizeOutput(o.actual) === normalizeOutput(c.expected);
            if (!passed) status = "wrong_answer";
            cases.push({ ...c, actual: o.actual ?? "", passed });
          }
        });
        execution_time_ms = (res.compile_ms ?? 0) + res.outcomes.length * 40;
      }
    } else if (body.language === "python") {
      const { outcomes, runtimeUnavailable } = await runPythonSource(body.source_code, allVisible.map((c) => ({ input: c.input, expected: c.expected })));
      simulated = runtimeUnavailable;
      if (!simulated) {
        outcomes.forEach((o, i) => {
          const c = allVisible[i];
          stdout += o.actual ?? "";
          if (o.error) {
            status = "wrong_answer";
            stderr = o.error;
            cases.push({ ...c, actual: o.actual ?? "", passed: false, error: o.error });
          } else {
            const passed = normalizeOutput(o.actual) === normalizeOutput(c.expected);
            if (!passed) status = "wrong_answer";
            cases.push({ ...c, actual: o.actual ?? "", passed });
          }
        });
        execution_time_ms = 520 + outcomes.length * 30;
      }
    }

    if (simulated) {
      /* demo fallback (Java, or when an in-browser runtime could not be downloaded) */
      allVisible.forEach((c) => {
        stdout += c.expected;
        cases.push({ ...c, actual: c.expected, passed: true });
      });
    }

    return respond({
      status,
      stdout,
      stderr,
      execution_time_ms,
      memory_kb: 18240,
      sample_visible: true,
      cases,
      judged: simulated ? "simulated" : "real",
    });
  }
  if (url === "/coding/submit" && method === "post") {
    const found = findProblem(body.problem_id);
    if (!found) return Promise.reject({ error: "NOT_FOUND", message: "Problem not found." });
    const hidden = found.problem.hidden_cases;
    const total = hidden.length;
    let passed = 0;
    let verdict: string = "wrong_answer";
    let execution_time_ms = 500 + Math.floor(Math.random() * 300);
    let stderrHint = "";
    let simulated = body.language === "java";

    if (body.language === "c" || body.language === "cpp") {
      const res = await runNativeCode(body.language, body.source_code, hidden.map((c) => ({ input: c.input, expected: c.expected_output })));
      if (res.runtimeUnavailable) {
        simulated = true;
      } else if (res.compileError) {
        verdict = "compilation_error";
        passed = 0;
        stderrHint = res.compileError;
        execution_time_ms = res.compile_ms ?? 0;
      } else {
        let ok = 0;
        res.outcomes.forEach((o, i) => {
          const match = !o.error && normalizeOutput(o.actual) === normalizeOutput(hidden[i].expected_output);
          if (match) ok += 1;
          else if (!stderrHint && o.error) stderrHint = o.error;
        });
        passed = ok;
        execution_time_ms = (res.compile_ms ?? 0) + res.outcomes.length * 50;
      }
    } else if (body.language === "python") {
      const { outcomes, runtimeUnavailable } = await runPythonSource(body.source_code, hidden.map((c) => ({ input: c.input, expected: c.expected_output })));
      simulated = runtimeUnavailable;
      if (!simulated) {
        let ok = 0;
        outcomes.forEach((o, i) => {
          const match = !o.error && normalizeOutput(o.actual) === normalizeOutput(hidden[i].expected_output);
          if (match) ok += 1;
          else if (!stderrHint && o.error) stderrHint = o.error;
        });
        passed = ok;
        execution_time_ms = 620 + outcomes.length * 30;
      }
    }

    if (simulated) {
      verdict = VERDICTS[Math.floor(Math.random() * VERDICTS.length)];
      passed = verdict === "accepted" ? total : Math.floor(total * 0.6);
      execution_time_ms = verdict === "accepted" ? 842 : 510 + Math.floor(Math.random() * 300);
    } else if (verdict === "compilation_error") {
      passed = 0;
    } else {
      verdict = passed === total ? "accepted" : "wrong_answer";
    }

    const submission = {
      id: `s-${Date.now()}`,
      problem_id: body.problem_id,
      problem_title: found.problem.title,
      language: body.language,
      status: verdict,
      execution_time_ms,
      memory_kb: 18720,
      score: Math.round(found.problem.max_score * (passed / Math.max(total, 1))),
      submitted_at: new Date().toISOString(),
    };
    store.submissions.unshift(submission);
    return respond({
      submission_id: submission.id,
      status: verdict,
      execution_time_ms: submission.execution_time_ms,
      memory_kb: submission.memory_kb,
      score: submission.score,
      passed,
      total,
      message: verdict === "accepted" ? "All hidden test cases passed." : "Some hidden test cases failed.",
      stderr_hint: stderrHint || undefined,
      judged: simulated ? "simulated" : "real",
    });
  }
  if (url === "/coding/submissions" && method === "get") {
    const pid = (config.params as { problem_id?: string } | undefined)?.problem_id;
    const subs = pid ? store.submissions.filter((s: any) => s.problem_id === pid) : store.submissions;
    return respond({ submissions: subs });
  }
  if (url === "/leaderboard/round2" && method === "get") {
    const teams = makeTeams().map((t, i) => ({ ...t, id: `team-${i + 1}` }));
    const entries = teams
      .filter((t) => t.score > 0 || t.status === "completed")
      .sort((a, b) => b.score - a.score || (a.team_time_seconds ?? 9999) - (b.team_time_seconds ?? 9999))
      .map((t, i) => ({ rank: i + 1, team_id: t.id, name: t.name, color: t.color, score: t.score, time_seconds: t.team_time_seconds ?? 0, status: t.status }));
    return respond({ entries, updated_at: new Date().toISOString() });
  }

  /* ----- admin ----- */
  if (url === "/admin/dashboard" && method === "get") {
    const qualified = r1Participants.filter((p) => p.qualification_status === "qualified");
    return respond({
      stats: {
        total_participants: 128,
        quiz_completed: 96,
        qualified: 24,
        teams_created: 6,
        active_teams: 3,
        completed_teams: 1,
        avg_quiz_score: 14.6,
        highest_quiz_score: 20,
        total_submissions: 48,
        accepted_submissions: 31,
      },
      score_distribution: [
        { range: "0–4", count: 4 },
        { range: "5–8", count: 12 },
        { range: "9–12", count: 30 },
        { range: "13–16", count: 34 },
        { range: "17–20", count: 16 },
      ],
      recent_activity: [
        { id: 1, actor: "Dr. Sarah Lin", action: "TEAM_STARTED", target: "Team Phoenix", at: new Date(t0 - secs(90)).toISOString() },
        { id: 2, actor: "Utsav Patel", action: "MEMBER_HANDOFF", target: "Team Phoenix · M1 → M2", at: new Date(t0 - secs(300)).toISOString() },
        { id: 3, actor: "System", action: "CODE_SUBMITTED", target: "Team Volt · Problem 2", at: new Date(t0 - secs(480)).toISOString() },
        { id: 4, actor: "Dr. Sarah Lin", action: "ROUND2_ACCESS_GRANTED", target: "Team Quantum", at: new Date(t0 - mins(12)).toISOString() },
        { id: 5, actor: "Sem Automation", action: "QUIZ_SUBMITTED", target: "P-1011 · 10/20", at: new Date(t0 - mins(18)).toISOString() },
      ],
    });
  }
  if (url === "/admin/questions" && method === "get") {
    return respond({
      questions: questionBank.map((q, i) => ({
        id: q.id,
        text: q.text,
        options: q.options,
        correct_option: q.correct,
        category: q.category,
        difficulty: q.difficulty,
        marks: q.marks,
        is_enabled: i % 7 !== 3,
      })),
    });
  }
  if (url === "/admin/participants" && method === "get") {
    return respond({
      participants: r1Participants.map((p) => ({
        id: p.id,
        participant_code: p.participant_code,
        name: p.name,
        email: `${p.name.toLowerCase().replace(/[^a-z]+/g, ".")}@college.edu`,
        department: p.department,
        year: p.year,
        quiz_status: p.status,
        score: p.status === "not_submitted" ? null : p.score,
        submitted_at: p.status === "not_submitted" ? null : new Date(t0 - mins(3) - p.time_taken_seconds * 1000).toISOString(),
        qualification_status: p.qualification_status,
      })),
    });
  }
  if (url === "/admin/qualify" && method === "post") {
    return respond({ updated: body.participant_ids?.length ?? 0 });
  }
  if (url === "/admin/teams" && method === "get") {
    return respond({ teams: store.adminTeams });
  }
  if (url === "/admin/teams" && method === "post") {
    const t = { id: `team-${Date.now()}`, name: body.name ?? "New Team", color: "#6366F1", members: body.member_names ?? [], status: "pending", round2_access: false, score: 0, current_member_number: 0 };
    store.adminTeams.push(t as any);
    return respond(t, 201);
  }
  if (/^\/admin\/teams\/[\w-]+\/(grant-access|revoke-access|activate|pause|resume|reset)$/.test(url) && method === "post") {
    return respond({ ok: true });
  }
  if (url === "/admin/live" && method === "get") {
    return respond(store.adminLive);
  }

  /* fallback */
  throw Object.assign(new Error(`[demo] Unhandled request ${method.toUpperCase()} ${url}`), {
    error: "UNKNOWN_ERROR",
    message: `Demo adapter does not implement ${method.toUpperCase()} ${url}.`,
  });
}