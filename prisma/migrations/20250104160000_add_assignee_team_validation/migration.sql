-- ✅ Database Trigger: Validates assigneeId vs. Team Consistency
-- This ensures that when a task is assigned to a user, that user MUST belong to the team of the current stage

-- Function that validates consistency between assignee and team
CREATE OR REPLACE FUNCTION validate_task_assignee_team()
RETURNS TRIGGER AS $$
BEGIN
  -- If assigneeId is not null, validate team
  IF NEW."assigneeId" IS NOT NULL THEN
    -- Check if user belongs to the correct team
    IF NOT EXISTS (
      SELECT 1 
      FROM "User" u
      INNER JOIN "TemplateStage" ts ON ts.id = NEW."currentStageId"
      WHERE u.id = NEW."assigneeId" 
        AND u."teamId" = ts."defaultTeamId"
    ) THEN
      RAISE EXCEPTION 'User % does not belong to the team of the current stage', NEW."assigneeId";
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on INSERT and UPDATE
CREATE TRIGGER check_task_assignee_team
  BEFORE INSERT OR UPDATE ON "Task"
  FOR EACH ROW
  EXECUTE FUNCTION validate_task_assignee_team();