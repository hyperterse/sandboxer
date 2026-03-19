package core

import "context"

// CreatePTYRequest configures a new PTY session.
type CreatePTYRequest struct {
	Rows    *int
	Cols    *int
	Cwd     *string
	Env     map[string]string
	User    *string
	Command *string
}

// CreatePTY is a package-level helper.
func CreatePTY(ctx context.Context, s Sandbox, req CreatePTYRequest) (PTYInfo, error) {
	if s == nil {
		return PTYInfo{}, ErrBadConfig
	}
	return s.CreatePTY(ctx, req)
}
