import cdk = require('@aws-cdk/cdk');
import lambda = require('@aws-cdk/aws-lambda');

export class LambdaStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);
  
      //const lambdaCode = lambda.Code.asset();
      new lambda.Function(this, 'Lambda', {
        runtime: lambda.Runtime.Go1x,
        code: lambda.Code.asset('resources'),
        handler: 'main'               
      });
    }
  }