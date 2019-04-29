package main

import (
	// "encoding/json"
	"fmt"
	"os"
	"context"
	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
    "github.com/aws/aws-sdk-go/aws/session"
	// "github.com/aws/aws-sdk-go/service/sqs"
	"github.com/aws/aws-sdk-go/service/dynamodb"
    "github.com/aws/aws-sdk-go/service/dynamodb/dynamodbattribute"
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
	svc := dynamodb.New(sess)
	tableName := os.Getenv("DYNAMO_TABLE")
	for _, record := range sqsEvent.Records {
		sqsRecord := record.MessageId

		fmt.Println(sqsRecord)

		av, err := dynamodbattribute.MarshalMap(record.Body)
		if err != nil {
			fmt.Println("Got error marshalling map:")
		}

		input := &dynamodb.PutItemInput{
			Item:      av,
			TableName: aws.String(tableName),
		}

		_, err = svc.PutItem(input)
		if err != nil {
			fmt.Println("Got error calling PutItem:")
		}
	}
}

func main() {
	lambda.Start(Handler)
}