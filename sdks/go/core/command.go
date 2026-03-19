package core

import "context"

// RunCommandRequest is a synchronous exec request.
type RunCommandRequest struct {
	Cmd            string
	Cwd            *string
	Env            map[string]string
	TimeoutSeconds *int
	User           *string
}

// StartCommandRequest starts an asynchronous command.
type StartCommandRequest struct {
	Cmd  string
	Cwd  *string
	Env  map[string]string
	User *string
}

// RunCommand is a package-level helper when you already hold a Sandbox.
func RunCommand(ctx context.Context, s Sandbox, req RunCommandRequest) (CommandResult, error) {
	if s == nil {
		return CommandResult{}, ErrBadConfig
	}
	return s.RunCommand(ctx, req)
}
