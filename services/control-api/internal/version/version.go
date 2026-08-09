// Package version provides version information for the control API
package version

import "runtime/debug"

var (
    Name    = "cadensend-control-api"
    Version = "0.1.0"
    Commit  = "dev"
)

func init() {
    if info, ok := debug.ReadBuildInfo(); ok {
        for _, setting := range info.Settings {
            if setting.Key == "vcs.revision" {
                Commit = setting.Value
            }
        }
    }
}

// Info contains version information
type Info struct {
    Name    string
    Version string
    Commit  string
}

// Get returns version information
func Get() *Info {
    return &Info{
        Name:    Name,
        Version: Version,
        Commit:  Commit,
    }
}
