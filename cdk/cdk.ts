import cdk = require('@aws-cdk/cdk')
import codepipeline = require('@aws-cdk/aws-codepipeline');
import lambda = require('@aws-cdk/aws-lambda');
import apigw = require('@aws-cdk/aws-apigateway');
import sqs = require('@aws-cdk/aws-sqs');
import { MakePipeline} from './lib/pipeline';

const app = new cdk.App();

const sharedStack = new cdk.Stack(app, 'SharedStack');

const sqsQueue = new sqs.Queue(sharedStack, 'SQS', {
  visibilityTimeoutSec: 300
});

const lambdaStarterStack = new cdk.Stack(app, 'LambdaStarterStack', {
  // remove the Stack from `cdk synth` and `cdk deploy`
  // unless you explicitly filter for it
  autoDeploy: false,
});

const lambdaCode = lambda.Code.cfnParameters();
const StarterFunc = new lambda.Function(lambdaStarterStack, 'Lambda', {
  code: lambdaCode,
  handler: 'main',
  runtime: lambda.Runtime.Go1x,
  environment: {
    SQS_QUEUE_NAME: sqsQueue.queueUrl
  }
});

sqsQueue.grantSendMessages(StarterFunc);
// other resources that your Lambda needs, added to the lambdaStack...
new apigw.LambdaRestApi(lambdaStarterStack, 'Endpoint', {
  handler: StarterFunc
});

const staterPipelineStack = new cdk.Stack(app, 'StarterPipelineStack');
const starterPipeline = MakePipeline(staterPipelineStack, 'StarterPipelineStack', 'cdk-ci-cd', 'LambdaStarterStack', 'starter', lambdaCode);

