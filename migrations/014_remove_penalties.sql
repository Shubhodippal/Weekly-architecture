-- Remove all penalty records (not_attempted with -10 points) from submissions
DELETE FROM submissions WHERE grade = 'not_attempted' AND points = -10;
