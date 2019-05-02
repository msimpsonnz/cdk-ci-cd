import cdk = require('@aws-cdk/cdk');
import dynamodb = require('@aws-cdk/aws-dynamodb')
import iam = require('@aws-cdk/aws-iam')
import { ServicePrincipal } from '@aws-cdk/aws-iam'
import lambda = require('@aws-cdk/aws-lambda');
import lambdaEvents = require('@aws-cdk/aws-lambda-event-sources');
import apigw = require('@aws-cdk/aws-apigateway');
import { IntegrationOptions, IntegrationResponse, MethodOptions, MethodResponse, EmptyModel } from '@aws-cdk/aws-apigateway';
import sqs = require('@aws-cdk/aws-sqs');
import { MakePipeline} from './lib/pipeline';

const app = new cdk.App();

const sharedStack = new cdk.Stack(app, 'SharedStack');

const sqsQueue = new sqs.Queue(sharedStack, 'SQS', {
  visibilityTimeoutSec: 300
});

const dataTable = new dynamodb.Table(sharedStack, 'DataTable', {
  partitionKey: { name: 'id', type: dynamodb.AttributeType.String },
  billingMode: dynamodb.BillingMode.PayPerRequest
});

//Create an IAM Role for API Gateway to assume
const apiGatewayRole = new iam.Role(sharedStack, 'ApiGatewayRole', {
  assumedBy: new ServicePrincipal('apigateway.amazonaws.com')
});

//Create an empty response model for API Gateway
var model :EmptyModel = {
  modelId: "Empty"
};
//Create a method response for API Gateway using the empty model
var methodResponse :MethodResponse = {
  statusCode: '200',
  responseModels: {'application/json': model}
};
//Add the method options with method response to use in API Method
var methodOptions :MethodOptions = {
  methodResponses: [
    methodResponse
  ]
};
//Create intergration response for SQS
var integrationResponse :IntegrationResponse = {
  statusCode: '200'
};

//Create integration options for API Method
var integrationOptions :IntegrationOptions = {
  credentialsRole: apiGatewayRole,
  requestParameters: {
    'integration.request.header.Content-Type': "'application/x-www-form-urlencoded'"
  },
  requestTemplates: {
    'application/json': 'Action=SendMessage&QueueUrl=$util.urlEncode("' + sqsQueue.queueUrl + '")&MessageBody=$util.urlEncode($input.body)'
  },
  integrationResponses: [
    integrationResponse
  ]
};

//Create the SQS Integration
const apiGatewayIntegration = new apigw.AwsIntegration({ 
  service: "sqs",
  path: sharedStack.env.account + '/' + sqsQueue.queueName,
  integrationHttpMethod: "POST",
  options: integrationOptions,
});

//Create the API Gateway
const apiGateway = new apigw.RestApi(sharedStack, "Endpoint");

//Create a API Gateway Resource
const msg = apiGateway.root.addResource('msg');
//Create a Resource Method
msg.addMethod('POST', apiGatewayIntegration, methodOptions);
//Grant API GW IAM Role access to post to SQS
sqsQueue.grantSendMessages(apiGatewayRole);

const lambdaWorkerStack = new cdk.Stack(app, 'LambdaWorkerStack', {
  autoDeploy: false,
});
lambdaWorkerStack.addDependency(sharedStack);
const lambdaWorkerCode = lambda.Code.cfnParameters();
const workerFunc = new lambda.Function(lambdaWorkerStack, 'Lambda', {
  code: lambdaWorkerCode,
  handler: 'main',
  runtime: lambda.Runtime.Go1x,
  environment: {
    DYNAMO_TABLE: dataTable.tableName
  }
});
const workerEventSource = new lambdaEvents.SqsEventSource(sqsQueue);
workerFunc.addEventSource(workerEventSource);
dataTable.grantReadWriteData(workerFunc);

const pipelineWorkerStack = new cdk.Stack(app, 'PipelineWorkerStack');
pipelineWorkerStack.addDependency(lambdaWorkerStack);
MakePipeline(pipelineWorkerStack, 'PipelineWorkerStack', 'cdk-ci-cd', 'LambdaWorkerStack', 'worker', lambdaWorkerCode);