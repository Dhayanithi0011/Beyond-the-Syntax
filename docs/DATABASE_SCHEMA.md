# Beyond The Syntax — Database Schema (PostgreSQL)

Types referenced: `uuid` (pk default `gen_random_uuid()`), `timestamptz`.

## users
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| auth_uid | text UNIQUE | Supabase `auth.users.id` (access-token `sub`) |
| email | text UNIQUE | |
| name | text | |
| role | enum(`admin`,`participant`) | |
| created_at | timestamptz | |

## admins
| id | uuid PK | |
| user_id | uuid FK -> users | |
| permissions | jsonb | for future fine-grained admin roles |

## participants
| id | uuid PK | |
| user_id | uuid FK -> users | |
| participant_code | text UNIQUE | e.g. `TEAM001` unrelated, human-friendly ID |
| department | text | |
| year | int | |
| phone | text | |
| registered_at | timestamptz | |

## competitions
| id | uuid PK | |
| name | text | |
| state | enum (see state machine) | |
| round1_duration_seconds | int | |
| round2_team_duration_seconds | int | |
| round2_early_handoff_allowed | boolean | |
| registration_open | boolean | |
| created_by | uuid FK -> admins | |
| created_at / updated_at | timestamptz | |

## rounds
| id | uuid PK | |
| competition_id | uuid FK | |
| round_number | int | 1 or 2 |
| status | enum(`pending`,`active`,`closed`) | |
| started_at / ended_at | timestamptz | |

## questions
| id | uuid PK | |
| competition_id | uuid FK | |
| text | text | |
| option_a/b/c/d | text | |
| correct_option | enum(A,B,C,D) | never serialized to participant-facing responses |
| category | text | |
| difficulty | enum(`easy`,`medium`,`hard`) | |
| marks | int | |
| is_enabled | boolean | |
| created_at | timestamptz | |

## quiz_attempts
| id | uuid PK | |
| participant_id | uuid FK | |
| competition_id | uuid FK | |
| question_order | jsonb | array of question_ids in the randomized order served |
| option_order | jsonb | per-question shuffled option mapping |
| started_at | timestamptz | |
| deadline | timestamptz | server-computed = started_at + round1_duration |
| submitted_at | timestamptz nullable | |
| status | enum(`in_progress`,`submitted`,`auto_submitted`) | |
| score | int nullable | computed on submit |
| correct_count / incorrect_count | int | |
| qualification_status | enum(`pending`,`qualified`,`not_qualified`) | admin-set after review |
| UNIQUE(participant_id, competition_id) | one attempt unless admin resets |

## quiz_answers
| id | uuid PK | |
| attempt_id | uuid FK | |
| question_id | uuid FK | |
| selected_option | enum(A,B,C,D) nullable | |
| is_correct | boolean nullable | filled at grading time |
| answered_at | timestamptz | |

## teams
| id | uuid PK | |
| competition_id | uuid FK | |
| name | text | |
| color / icon | text nullable | |
| status | enum(`pending`,`active`,`paused`,`completed`) | |
| round2_access | boolean | admin-controlled gate |
| created_at | timestamptz | |

## team_members
| id | uuid PK | |
| team_id | uuid FK | |
| participant_id | uuid FK | |
| member_number | int | 1..3, defines relay order |
| UNIQUE(team_id, member_number) | |
| UNIQUE(team_id, participant_id) | |

## team_sessions
Authoritative relay/timer state — one row per team, updated in place as the relay progresses.

| id | uuid PK | |
| team_id | uuid FK UNIQUE | |
| team_started_at | timestamptz nullable | |
| team_deadline | timestamptz nullable | |
| current_member_number | int nullable | 1,2,3 or null before start |
| member_started_at | timestamptz nullable | |
| member_deadline | timestamptz nullable | |
| status | enum(`not_started`,`active`,`completed`,`expired`) | |
| updated_at | timestamptz | |

## coding_problems
| id | uuid PK | |
| competition_id | uuid FK | |
| title | text | |
| statement_md | text | |
| constraints_md | text | |
| position | int | 1,2,3 — maps to member_number by relay convention |
| max_score | int | |
| time_limit_ms | int | per-execution |
| memory_limit_mb | int | |
| created_at | timestamptz | |

## test_cases
| id | uuid PK | |
| problem_id | uuid FK | |
| input | text | |
| expected_output | text | |
| is_sample | boolean | sample cases are visible via `/coding/run`; hidden ones only used at submit time |
| weight | int | for partial scoring if enabled |

## code_drafts
Auto-saved/team-shared working state per (team, problem).

| id | uuid PK | |
| team_id | uuid FK | |
| problem_id | uuid FK | |
| language | text | |
| source_code | text | |
| last_edited_by | uuid FK -> team_members | |
| updated_at | timestamptz | |
| UNIQUE(team_id, problem_id) | one shared draft, overwritten as members hand off |

## submissions
| id | uuid PK | |
| team_id | uuid FK | |
| problem_id | uuid FK | |
| member_id | uuid FK -> team_members | who submitted |
| language | text | |
| source_code | text | |
| status | enum(`accepted`,`wrong_answer`,`compilation_error`,`runtime_error`,`tle`,`mle`) | |
| execution_time_ms | int nullable | |
| memory_kb | int nullable | |
| score | int | |
| submitted_at | timestamptz | |

## leaderboards (materialized/derived — see note)
Rankings are computed on read (or via a refreshed materialized view), never trusted from the
client. `leaderboards` can exist as a cached table refreshed on every submit/quiz-submit event to
avoid recomputation under load:

| id | uuid PK | |
| competition_id | uuid FK | |
| round_number | int | |
| subject_type | enum(`participant`,`team`) | |
| subject_id | uuid | |
| score | int | |
| tiebreak_time_seconds | int | submission/completion time used for ties |
| rank | int | |
| computed_at | timestamptz | |

## audit_logs
| id | uuid PK | |
| user_id | uuid FK nullable | |
| action | text | e.g. `QUIZ_SUBMITTED`, `MEMBER_HANDOFF`, `ADMIN_ACTION` |
| metadata | jsonb | |
| ip_address | text nullable | |
| created_at | timestamptz | |

## Relationship summary
```
users --1:1--> participants / admins
competitions --1:N--> rounds, questions, teams, coding_problems
participants --1:1--> quiz_attempts (per competition) --1:N--> quiz_answers
teams --1:N--> team_members (exactly 3) --1:1--> participants
teams --1:1--> team_sessions
coding_problems --1:N--> test_cases
teams x coding_problems --1:1--> code_drafts
teams x coding_problems x team_members --1:N--> submissions
```
