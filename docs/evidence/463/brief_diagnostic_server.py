from stellis import daily_brief
from stellis.server import app
check = daily_brief.validate_answer
def inspect_answer(answer, coverage):
    result = check(answer, coverage)
    if result:
        with open('/tmp/brief-rejected.txt','a') as stream:
            stream.write(answer+'\nREASON: '+result+'\n')
    return result
daily_brief.validate_answer = inspect_answer
