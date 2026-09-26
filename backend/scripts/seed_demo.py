"""
Seeds the configured competition with a default MCQ question bank and coding
problems so the live (non-demo) UI has real data to render, and the quiz /
coding endpoints can be exercised end-to-end. QUESTION_BANK is the source of
truth for Round 1: each run REPLACES the competition's existing MCQs with the
bank below (stale answers and attempts are removed first, so attempts are
invalidated on re-seed). PROBLEM_BANK (scripts/coding_bank.py) is the source
of truth for Round 2 and is also REPLACED on every run.

Run from backend/ with the venv interpreter:
    .venv\Scripts\python.exe -m scripts.seed_demo
"""
import asyncio

from sqlalchemy import select, func, delete

from app.core.database import SessionLocal
from app.models.models import (
    CodeDraft, CodingProblem, Competition, CompetitionState, Difficulty, Option, Question, QuizAnswer,
    QuizAttempt, Submission, TestCase,
)
from scripts.coding_bank import PROBLEM_BANK


def _q(text, opts, correct, category, difficulty, marks=1):
    return {
        "text": text,
        "option_a": opts[0],
        "option_b": opts[1],
        "option_c": opts[2],
        "option_d": opts[3],
        "correct_option": Option(correct),
        "category": category,
        "difficulty": Difficulty(difficulty),
        "marks": marks,
    }


QUESTION_BANK = [
    _q("What is the error?\n\n#include <stdio.h>\n\nint main() {\n    int age = 20\n    printf(\"%d\", age);\n    return 0;\n}",
       ["Error in printf()", "Missing semicolon after 20", "Error in return", "No error"], "B", "C Programming", "easy"),
    _q("Complete the program to read an integer:\n\n#include <stdio.h>\n\nint main() {\n    int n;\n    _________;\n    return 0;\n}",
       ["scanf(\"%d\", n)", "scanf(\"%d\", &n)", "scanf(\"%f\", &n)", "input(n)"], "B", "C Programming", "easy"),
    _q("Which is the correct way to declare an integer variable?",
       ["integer x;", "int x;", "x int;", "Integer x;"], "B", "C Programming", "easy"),
    _q("Which operator is used to find the remainder in C?",
       ["/", "//", "%", "rem"], "C", "C Programming", "easy"),
    _q("Complete the code to check whether a number is positive:\n\nint n = 10;\n\nif (_________)\n    printf(\"Positive\");",
       ["n < 0", "n == 0", "n > 0", "n != 10"], "C", "C Programming", "easy"),
    _q("Find the error:\n\n#include <stdio.h>\n\nint main() {\n    float marks = 85.5;\n    printf(\"%d\", marks);\n    return 0;\n}\n\nWhat should be changed?",
       ["%d → %f", "%f → %d", "float → int only", "Nothing"], "A", "C Programming", "easy"),
    _q("Arrange these statements to calculate the sum:\n\nA. printf(\"%d\", sum);\nB. int sum = a + b;\nC. int a = 10, b = 20;",
       ["A → B → C", "B → C → A", "C → B → A", "C → A → B"], "C", "C Programming", "easy"),
    _q("Which is the correct if statement?",
       ["if x > 10", "if (x > 10)", "if [x > 10]", "if {x > 10}"], "B", "C Programming", "easy"),
    _q("Complete the loop to print numbers from 1 to 5:\n\nfor(int i = 1; _________; i++)\n{\n    printf(\"%d \", i);\n}",
       ["i < 5", "i <= 5", "i = 5", "i != 5"], "B", "C Programming", "easy"),
    _q("Which keyword is used to exit a loop immediately?",
       ["stop", "exit", "break", "continue"], "C", "C Programming", "easy"),
    _q("What is the problem?\n\nint numbers[5];\n\nfor(int i = 0; i <= 5; i++)\n{\n    numbers[i] = i;\n}",
       ["Array size should be 6", "Loop should start at 1", "Condition should be i < 5", "No error"], "C", "C Programming", "easy"),
    _q("Complete the code to find the larger of two numbers:\n\nint a = 20, b = 15;\nif (_________)\n      printf(\"A is larger\");\nelse\n      printf(\"B is larger\");",
       ["a < b", "a > b", "a = b", "a == b"], "B", "C Programming", "easy"),
    _q("Arrange the statements to swap two numbers:\n\nA. int temp = a;\nB. a = b;\nC. b = temp;",
       ["A → B → C", "B → C → A", "C → A → B", "B → A → C"], "A", "C Programming", "medium"),
    _q("Which correctly checks whether n is even?",
       ["if(n / 2 == 0)", "if(n % 2 == 0)", "if(n % 2 == 1)", "if(n * 2 == 0)"], "B", "C Programming", "easy"),
    _q("Complete the code to calculate the sum of array elements:\n\nint a[] = {10, 20, 30};\nint sum = 0;\n\nfor(int i = 0; i < 3; i++)\n{\n    ___________;\n}",
       ["sum = i;", "sum = a;", "sum = sum + a[i];", "sum = sum + i;"], "C", "C Programming", "easy"),
    _q("What is the issue?\n\nint n = 10;\n\nif(n = 5)\n    printf(\"Five\");",
       ["= should be ==", "5 should be 10", "if cannot compare numbers", "No error"], "A", "C Programming", "easy"),
    _q("Which statement about arrays is correct?",
       ["Array indexing starts from 1", "Array indexing starts from 0", "Array indexing starts from -1", "Arrays cannot store integers"], "B", "C Programming", "easy"),
    _q("Complete the function:\n\nint add(int a, int b)\n{\n       _________;\n}",
       ["print a + b;", "return a + b;", "output a + b;", "give a + b;"], "B", "C Programming", "easy"),
    _q("The following program should print numbers from 1 to 5 but contains a bug:\n\nint i = 1;\nwhile(i <= 5)\n{\n          printf(\"%d \", i);\n}\n\nWhat is missing?",
       ["i = 0;", "i++", "i--;", "break;"], "B", "C Programming", "easy"),
    _q("Which correctly declares a character variable containing A?",
       ["char ch = \"A\";", "char ch = 'A';", "character ch = A;", "char ch = A;"], "B", "C Programming", "easy"),
    _q("Arrange the statements to calculate factorial:\n\nA. fact = fact * i;\nB. int fact = 1;\nC. for(i = 1; i <= n; i++)\nD. printf(\"%d\", fact);",
       ["B → C → A → D", "C → B → A → D", "B → A → C → D", "A → B → C → D"], "A", "C Programming", "medium"),
    _q("Which condition correctly checks whether a person is eligible if age must be 18 or above?\n\nif(_________)\n    printf(\"Eligible\");",
       ["age > 18", "age < 18", "age >= 18", "age == 18"], "C", "C Programming", "easy"),
    _q("What is the main problem?\n\n#include <stdio.h>\n\nint main()\n{\n    int *p;\n    *p = 10;\n\n    printf(\"%d\", *p);\n\n    return 0;\n}",
       ["Pointer cannot store integers", "p is not initialized to a valid memory address", "printf() cannot print pointers", "int *p is invalid"], "B", "C Programming", "medium"),
    _q("Complete the code to access the third element using a pointer:\n\nint a[] = {10, 20, 30, 40};\nint *p = a;\n\nprintf(\"%d\", ___________);",
       ["*p", "*(p + 1)", "*(p + 2)", "*(p + 3)"], "C", "C Programming", "medium"),
    _q("The program should count how many elements are greater than 10:\n\nint a[] = {5, 15, 20, 8};\nint count = 0;\n\nfor(int i = 0; i < 4; i++)\n{\n    if(a[i] > 10);\n        count++;\n}\n\nWhat is the bug?",
       ["Array declaration is wrong", "count should be initialized to 1", "Extra semicolon after if", "i should start from 1"], "C", "C Programming", "medium"),
    _q("Arrange the following to find the largest element in an array:\n\nA. if(a[i] > max)\n       max = a[i];\n\nB. int max = a[0];\n\nC. for(int i = 1; i < n; i++)\n\nD. printf(\"%d\", max);",
       ["B → C → A → D", "C → B → A → D", "B → A → C → D", "A → B → C → D"], "A", "C Programming", "medium"),
    _q("Which correctly defines a function that receives an integer and returns its square?\n\nA)  int square(int n)\n      {\n            return n * n;\n       }\n\nB)  square(int n)\n      {\n            print n * n;\n       }\n\nC)  function square(n)\n      {\n              return n * n;\n       }\n\nD)  int square()\n      {\n           return n * n;\n       }",
       ["B", "C", "A", "D"], "C", "C Programming", "easy"),
    _q("Complete the recursive factorial function:\n\nint factorial(int n)\n{\n    if(n == 0)\n        return 1;\n\n    return ___________;\n}",
       ["n + factorial(n)", "n * factorial(n - 1)", "n * factorial(n + 1)", "factorial(n)"], "B", "C Programming", "medium"),
    _q("The following function is intended to modify the original variable:\n\nvoid change(int x)\n{\n    x = 100;\n}\n\nint main()\n{\n    int a = 10;\n    change(a);\n    printf(\"%d\", a);\n}\n\nWhat should be changed so that a becomes 100?",
       ["Use a pointer parameter", "Make x a float", "Use static", "Add return 100"], "A", "C Programming", "medium"),
    _q("Complete the code to reverse an integer using a loop:\n\nint n = 123;\nint rev = 0;\n\nwhile(n > 0)\n{\n    int digit = n % 10;\n    rev = ___________;\n    n = n / 10;\n}",
       ["rev + digit", "rev * 10 + digit", "rev / 10 + digit", "digit + 10"], "B", "C Programming", "medium"),
]

# PROBLEM_BANK (30 coding problems, 10 sets x 3) lives in scripts/coding_bank.py.


async def seed() -> None:
    async with SessionLocal() as db:
        comp = await db.scalar(select(Competition).order_by(Competition.created_at.desc()).limit(1))
        if comp is None:
            comp = Competition(
                name="Beyond The Syntax 2026",
                state=CompetitionState.registration_open,
                round1_duration_seconds=30 * 60,
                round2_team_duration_seconds=45 * 60,
                round2_early_handoff_allowed=True,
            )
            db.add(comp)
            await db.flush()

        # The bank below owns Round 1: replace existing MCQs every run.
        existing_questions = (
            await db.scalar(select(func.count()).select_from(Question).where(Question.competition_id == comp.id)) or 0
        )
        if existing_questions:
            q_ids = (
                await db.scalars(select(Question.id).where(Question.competition_id == comp.id))
            ).all()
            attempt_ids = (
                await db.scalars(select(QuizAttempt.id).where(QuizAttempt.competition_id == comp.id))
            ).all()
            if q_ids:
                await db.execute(delete(QuizAnswer).where(QuizAnswer.question_id.in_(q_ids)))
            if attempt_ids:
                await db.execute(delete(QuizAttempt).where(QuizAttempt.id.in_(attempt_ids)))
            if q_ids:
                await db.execute(delete(Question).where(Question.id.in_(q_ids)))
            print(f"[seed] replaced {existing_questions} existing questions")

        for spec in QUESTION_BANK:
            db.add(Question(competition_id=comp.id, **spec))
        print(f"[seed] inserted {len(QUESTION_BANK)} questions")

        # The bank below owns Round 2: replace existing coding problems every run.
        existing_problems = (
            await db.scalar(select(func.count()).select_from(CodingProblem).where(CodingProblem.competition_id == comp.id)) or 0
        )
        if existing_problems:
            problem_ids = (
                await db.scalars(select(CodingProblem.id).where(CodingProblem.competition_id == comp.id))
            ).all()
            if problem_ids:
                await db.execute(delete(CodeDraft).where(CodeDraft.problem_id.in_(problem_ids)))
                await db.execute(delete(Submission).where(Submission.problem_id.in_(problem_ids)))
                await db.execute(delete(TestCase).where(TestCase.problem_id.in_(problem_ids)))
                await db.execute(delete(CodingProblem).where(CodingProblem.id.in_(problem_ids)))
            print(f"[seed] replaced {existing_problems} existing coding problems")

        problems = sorted(PROBLEM_BANK, key=lambda p: (p.set_number, p.q_number))
        for idx, p in enumerate(problems, start=1):
            problem = CodingProblem(
                competition_id=comp.id,
                title=p.title,
                statement_md=p.statement,
                constraints_md=p.constraints,
                domain=p.domain,
                difficulty=p.difficulty,
                position=idx,
                max_score=p.max_score,
                time_limit_ms=p.time_limit_ms,
                memory_limit_mb=p.memory_limit_mb,
            )
            db.add(problem)
            await db.flush()
            for input_, output in p.samples:
                db.add(TestCase(problem_id=problem.id, input=input_, expected_output=output,
                                is_sample=True, test_type="sample", weight=1))
            for input_, output in p.direct:
                db.add(TestCase(problem_id=problem.id, input=input_, expected_output=output,
                                is_sample=False, test_type="direct", weight=1))
            for input_, output in p.hidden:
                db.add(TestCase(problem_id=problem.id, input=input_, expected_output=output,
                                is_sample=False, test_type="hidden", weight=1))
        print(f"[seed] inserted {len(problems)} coding problems "
              f"({len([p for p in problems if p.difficulty == 'easy'])} easy, "
              f"{len([p for p in problems if p.difficulty == 'intermediate'])} intermediate)")

        await db.commit()

        total_questions = (
            await db.scalar(select(func.count()).select_from(Question).where(Question.competition_id == comp.id)) or 0
        )
        total_problems = (
            await db.scalar(select(func.count()).select_from(CodingProblem).where(CodingProblem.competition_id == comp.id)) or 0
        )
        print(
            f"[seed] competition={comp.name!r} id={comp.id} state={comp.state.value if comp.state else comp.state} "
            f"questions={total_questions} problems={total_problems}"
        )


if __name__ == "__main__":
    asyncio.run(seed())