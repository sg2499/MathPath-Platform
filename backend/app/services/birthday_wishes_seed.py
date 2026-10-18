"""The starting set of birthday wishes (2026-10-18).

The greeting card already says "Happy Birthday, {name}!" above the wish, so
most wishes don't say it again. Placeholders: {name} (first name), {age},
{level} (current level code; only given to students who have one).

Age bands: YOUNG 3-8, MIDDLE 9-12, OLDER 13+, ALL any age.
Styles: WARM, PLAYFUL, PROUD, MATHS, SHORT.

Each wish has a stable key. Seeding adds missing keys only, so a wish an
admin has edited or switched off is never put back or overwritten.
"""

# (key, style, age band, text)
SEED_WISHES: list[tuple[str, str, str, str]] = [
    # WARM: for every age
    ("warm-01", "WARM", "ALL", "Today is all about you, {name}. We hope it's filled with laughter, cake and everyone you love."),
    ("warm-02", "WARM", "ALL", "Wishing you a year as bright as your smile, {name}. Enjoy every moment of your special day."),
    ("warm-03", "WARM", "ALL", "Every class is better with you in it, {name}. We hope today is as special as you are."),
    ("warm-04", "WARM", "ALL", "May this year bring you new friends, new adventures and lots of reasons to smile."),
    ("warm-05", "WARM", "ALL", "Sending you the biggest birthday hug from all of us at MathPath. Enjoy every minute of today!"),
    ("warm-06", "WARM", "ALL", "We're so glad you're part of the MathPath family, {name}. Have a wonderful day."),
    ("warm-07", "WARM", "ALL", "Here's to a day full of fun and a year full of good things, {name}."),
    ("warm-08", "WARM", "ALL", "May every wish you make today come true, and may the year ahead be your best one yet."),
    ("warm-09", "WARM", "ALL", "{age} looks wonderful on you, {name}. Have a day as lovely as you are."),
    ("warm-10", "WARM", "ALL", "Keep being curious, keep being kind and keep being you. We hope today is magical."),
    ("warm-11", "WARM", "YOUNG", "We hope your day is full of balloons, giggles and your very favourite cake, {name}."),
    ("warm-12", "WARM", "OLDER", "Wishing you a year of confidence, clear thinking and plenty of moments that make you smile, {name}."),
    ("warm-13", "WARM", "OLDER", "{age} is a great chapter to begin. May it be full of growth, good friends and well-earned wins."),
    ("warm-14", "WARM", "OLDER", "You've grown so much, in your work and as a person. Have a wonderful birthday, {name}."),

    # PLAYFUL: lighter, mostly for younger students
    ("play-01", "PLAYFUL", "YOUNG", "Cake first, sums later! Today's only lesson is to have the best day ever, {name}."),
    ("play-02", "PLAYFUL", "YOUNG", "Today you get an extra-big slice of cake. Teacher's orders, {name}!"),
    ("play-03", "PLAYFUL", "YOUNG", "Party hats on! {name} is {age} today, and that calls for a celebration."),
    ("play-04", "PLAYFUL", "YOUNG", "Balloons up, candles lit: {age} today! Have a super fun birthday, {name}."),
    ("play-05", "PLAYFUL", "YOUNG", "Hip hip hooray, {name} is {age} today!"),
    ("play-06", "PLAYFUL", "MIDDLE", "Warning: today may contain extra cake, extra smiles and extra fun. Enjoy it all, {name}!"),
    ("play-07", "PLAYFUL", "MIDDLE", "Level up! {name} has unlocked age {age}. New powers include even bigger birthday wishes."),
    ("play-08", "PLAYFUL", "ALL", "Today's only homework: eat cake, laugh a lot and have an amazing day, {name}."),
    ("play-09", "PLAYFUL", "MIDDLE", "No timers, no tests, just you and a very large cake. Have a brilliant birthday, {name}!"),
    ("play-10", "PLAYFUL", "ALL", "We checked the calendar twice: today really is the best day of the year. Have fun, {name}!"),

    # MATHS: number-flavoured, never preachy
    ("math-01", "MATHS", "ALL", "You + cake + friends = the perfect birthday. Have a great one, {name}!"),
    ("math-02", "MATHS", "ALL", "{age} candles, countless smiles and one amazing you. Have a wonderful day, {name}."),
    ("math-03", "MATHS", "ALL", "We did the maths, {name}: this year adds up to something wonderful."),
    ("math-04", "MATHS", "MIDDLE", "May your joys multiply, your worries divide and your fun never subtract."),
    ("math-05", "MATHS", "OLDER", "May your joys multiply, your worries divide and the year ahead add up to your best one yet."),
    ("math-06", "MATHS", "ALL", "Count your candles, then count your blessings. Both add up beautifully, {name}."),
    ("math-07", "MATHS", "MIDDLE", "Plus a year, times the fun, minus the worries. That's our birthday formula for you, {name}."),
    ("math-08", "MATHS", "ALL", "On an abacus, {age} is just a few beads. To all of us, you count for so much more."),
    ("math-09", "MATHS", "ALL", "Your birthday is one day out of 365, but you make every class count, {name}."),
    ("math-10", "MATHS", "ALL", "If happiness were a number, we'd wish you the biggest one there is, {name}."),
    ("math-11", "MATHS", "YOUNG", "Today's answer is easy: {name} + birthday = celebration!"),
    ("math-12", "MATHS", "ALL", "Like a perfect score, today is all yours, {name}. Enjoy every bit of it."),
    ("math-13", "MATHS", "MIDDLE", "Some things are hard to calculate. How much we enjoy having you at MathPath isn't one of them."),
    ("math-14", "MATHS", "YOUNG", "One, two, three... {age}! Count the candles, make a wish and blow them all out, {name}."),
    ("math-15", "MATHS", "OLDER", "Here's to a year where every problem has a neat solution and every day adds something good."),

    # PROUD: effort and progress ({level} ones need a current level)
    ("proud-01", "PROUD", "ALL", "Every bead you've moved and every sum you've solved has brought you here. Today, we celebrate you."),
    ("proud-02", "PROUD", "ALL", "You've worked so hard this year, {name}. Today, it's time to put the pencil down and celebrate."),
    ("proud-03", "PROUD", "ALL", "From all of us at MathPath: we're proud of how far you've come in {level}. Here's to an even better year."),
    ("proud-04", "PROUD", "MIDDLE", "Your focus and effort in {level} make us proud. Have a birthday as bright as your future, {name}."),
    ("proud-05", "PROUD", "MIDDLE", "Another year older, another year sharper. We can't wait to see what you achieve at {age}."),
    ("proud-06", "PROUD", "OLDER", "{age} is a great age for big goals, {name}. We know you'll reach every one of them."),
    ("proud-07", "PROUD", "ALL", "Your teachers see how hard you try, {name}. Today, we're all cheering for you."),
    ("proud-08", "PROUD", "OLDER", "The way you take on {level} shows real grit. Enjoy your special day, {name}, you've earned it."),
    ("proud-09", "PROUD", "OLDER", "You bring determination to every lesson. May this year bring you every success you're working for."),
    ("proud-10", "PROUD", "ALL", "Here's to a year of new levels, new records and new reasons to be proud of yourself, {name}."),
    ("proud-11", "PROUD", "YOUNG", "You're getting so quick with numbers, {name}! We're very proud of you. Have a happy, happy day."),
    ("proud-12", "PROUD", "YOUNG", "Look how much you've learnt in {level}, {name}! Today is for cake, smiles and feeling proud."),

    # SHORT: one line
    ("short-01", "SHORT", "ALL", "Have a fantastic day, {name}. You deserve it!"),
    ("short-02", "SHORT", "ALL", "Big smiles and best wishes on your special day, {name}!"),
    ("short-03", "SHORT", "ALL", "Wishing you lots of love and laughter today, {name}."),
    ("short-04", "SHORT", "ALL", "Have the most wonderful day, {name}!"),
    ("short-05", "SHORT", "ALL", "Enjoy your day to the fullest, {name}. Here's to {age}!"),
    ("short-06", "SHORT", "ALL", "Sending warm wishes your way today, {name}!"),
    ("short-07", "SHORT", "ALL", "Make a wish, {name}! We hope it comes true."),
    ("short-08", "SHORT", "ALL", "All our best wishes for your special day, {name}."),
    ("short-09", "SHORT", "YOUNG", "Yay, it's your birthday! Have so much fun today, {name}."),
    ("short-10", "SHORT", "OLDER", "Have a brilliant birthday, {name}. Here's to a great year at {age}."),
]


def SeedBirthdayWishes(Db) -> int:
    """Add any seeded wish that isn't there yet (by key). Returns how many
    were added. Never changes or re-enables an existing wish."""
    from app.models import BirthdayWish

    Existing = {Key for (Key,) in Db.query(BirthdayWish.seed_key).filter(BirthdayWish.seed_key.isnot(None)).all()}
    Added = 0
    for Key, Style, Band, Text in SEED_WISHES:
        if Key in Existing:
            continue
        Db.add(BirthdayWish(seed_key=Key, text=Text, style=Style, age_band=Band, needs_level="{level}" in Text, is_active=True))
        Added += 1
    if Added:
        Db.commit()
    return Added
