package main

import (
	// "encoding/json"
	"fmt"
	//"os"
	"context"
	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	// "github.com/aws/aws-sdk-go/aws"
    "github.com/aws/aws-sdk-go/aws/session"
    // "github.com/aws/aws-sdk-go/service/sqs"
)

//Message body for batch
type Message struct {
	Batch int `json:"batch"`
}

var sess = session.Must(session.NewSessionWithOptions(session.Options{
	SharedConfigState: session.SharedConfigEnable,
}))

//Handler for Lambda function entry point
func Handler(ctx context.Context, sqsEvent events.SQSEvent) {
	for _, record := range sqsEvent.Records {
		sqsRecord := record.MessageId

		fmt.Println(sqsRecord)
	}
}

func main() {
	lambda.Start(Handler)
}