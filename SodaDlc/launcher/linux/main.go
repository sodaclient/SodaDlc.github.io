package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx           context.Context
	apiBase       string
	currentBrand  string
	appVersion    string
	httpClient    *http.Client
	userData      map[string]interface{}
	launchReady   bool
}

// NewApp creates a new App application struct
func NewApp() *App {
	jar, _ := cookiejar.New(nil)
	return &App{
		apiBase:      "http://localhost:3000", // Change for production
		currentBrand: "SodaDlc",
		appVersion:   "1.0.0",
		httpClient: &http.Client{
			Jar: jar,
			Timeout: 30 * time.Second,
		},
	}
}

// startup is called when the app starts. The context is saved
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Set default brand
	runtime.EventsEmit(ctx, "brand:set", a.currentBrand)
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, welcome to Soda Launcher!", name)
}

// GetVersion returns the launcher version
func (a *App) GetVersion() string {
	return a.appVersion
}

// GetBrand returns the current brand
func (a *App) GetBrand() string {
	return a.currentBrand
}

// SetBrand sets the current brand
func (a *App) SetBrand(brand string) {
	if brand == "SodaDlc" || brand == "SodaVisuals" || brand == "SodaLegit" {
		a.currentBrand = brand
		runtime.EventsEmit(a.ctx, "brand:set", brand)
	}
}

// GetOS returns the current OS
func (a *App) GetOS() string {
	return runtime.GOOS
}

// GetArch returns the current architecture
func (a *App) GetArch() string {
	return runtime.GOARCH
}

// apiCall makes an HTTP request to the API
func (a *App) apiCall(method, path string, body map[string]interface{}) (map[string]interface{}, error) {
	fullURL := a.apiBase + path
	var reqBody []byte
	var err error
	if body != nil {
		reqBody, err = json.Marshal(body)
		if err != nil {
			return nil, err
		}
	}

	req, err := http.NewRequest(method, fullURL, strings.NewReader(string(reqBody)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		errMsg := "Unknown error"
		if e, ok := result["error"].(string); ok {
			errMsg = e
		}
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, errMsg)
	}

	return result, nil
}

// launcherApiCall makes a call to the launcher API with brand/version/os/arch
func (a *App) launcherApiCall(path string, body map[string]interface{}) (map[string]interface{}, error) {
	if body == nil {
		body = make(map[string]interface{})
	}
	body["brand"] = a.currentBrand
	body["version"] = a.appVersion
	body["os"] = a.GetOS()
	body["arch"] = a.GetArch()
	return a.apiCall("POST", "/api/launcher"+path, body)
}

// Login authenticates the user
func (a *App) Login(username, password string) (map[string]interface{}, error) {
	data, err := a.launcherApiCall("/auth", map[string]interface{}{
		"username": username,
		"password": password,
	})
	if err != nil {
		return nil, err
	}
	a.userData = data
	return data, nil
}

// ActivateKey activates a license key
func (a *App) ActivateKey(key string) (map[string]interface{}, error) {
	data, err := a.launcherApiCall("/activate", map[string]interface{}{
		"key": key,
	})
	if err != nil {
		return nil, err
	}
	// Refresh status after activation
	a.CheckSubscription()
	return data, nil
}

// GetStatus gets the subscription/launch status
func (a *App) GetStatus() (map[string]interface{}, error) {
	data, err := a.apiCall("GET", "/api/launcher/status", nil)
	if err != nil {
		return nil, err
	}
	if canLaunch, ok := data["canLaunch"].(bool); ok {
		a.launchReady = canLaunch
	}
	return data, nil
}

// CheckSubscription checks and updates subscription status
func (a *App) CheckSubscription() {
	a.GetStatus()
}

// LogLaunch logs a launch event
func (a *App) LogLaunch(action, details string) (map[string]interface{}, error) {
	return a.launcherApiCall("/log", map[string]interface{}{
		"action":  action,
		"details": details,
	})
}

// CheckVersion checks for launcher updates
func (a *App) CheckVersion() (map[string]interface{}, error) {
	path := fmt.Sprintf("/api/launcher/version?brand=%s&current=%s", url.QueryEscape(a.currentBrand), a.appVersion)
	data, err := a.apiCall("GET", path, nil)
	if err != nil {
		return nil, err
	}
	return data, nil
}

// LaunchClient launches the actual game client
func (a *App) LaunchClient() error {
	// TODO: Implement actual client launch
	// Example: exec.Command("./SodaClient", "--brand", a.currentBrand).Start()
	runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:          runtime.InfoDialog,
		Title:         "Launch",
		Message:       fmt.Sprintf("Launching %s client...\n(Implement actual launch logic here)", a.currentBrand),
	})
	return nil
}

// OpenURL opens a URL in the default browser
func (a *App) OpenURL(urlStr string) error {
	return runtime.BrowserOpenURL(a.ctx, urlStr)
}

// MinimizeWindow minimizes the window
func (a *App) MinimizeWindow() {
	runtime.WindowMinimise(a.ctx)
}

// CloseWindow closes the window
func (a *App) CloseWindow() {
	runtime.Quit(a.ctx)
}

// GetConfig returns the API base URL (for frontend)
func (a *App) GetConfig() map[string]string {
	return map[string]string{
		"apiBase": a.apiBase,
	}
}

func main() {
	// Create the application
	app := NewApp()

	// Run the application
	err := run(app)
	if err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}
}

// run starts the Wails application
func run(app *App) error {
	// This would be replaced by wails.Run() in actual Wails v2
	// For now, we'll create a simple WebKitGTK wrapper
	return createWebKitGTKApp(app)
}

// createWebKitGTKApp creates a native Linux app using WebKitGTK via CGO
func createWebKitGTKApp(app *App) error {
	// This is a placeholder - in real Wails v2, you'd use:
	// wails.Run(&options.App{
	//     Title:  "Soda Launcher",
	//     Width:  520,
	//     Height: 720,
	//     AssetServer: &assetserver.Options{
	//         Assets: assets,
	//     },
	//     OnStartup: app.startup,
	//     Bind: []interface{}{
	//         app,
	//     },
	// })

	// For standalone build without Wails, we'll use a minimal WebKitGTK wrapper
	// The actual implementation would be in a separate CGO file
	return runWebKitGTK(app)
}

// runWebKitGTK runs the WebKitGTK webview
func runWebKitGTK(app *App) error {
	// This function will be implemented in webkit_linux.go with CGO
	// For now, return an error indicating it needs CGO compilation
	return fmt.Errorf("WebKitGTK backend not compiled. Build with: go build -tags webkit -o sodalauncher .")
}