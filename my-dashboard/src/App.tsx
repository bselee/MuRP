import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function App() {
  return (
    <div className="min-h-screen bg-background p-8">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Artifact Ready</CardTitle>
          <CardDescription>
            Your React + shadcn/ui artifact is ready to develop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button>Get Started</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default App
